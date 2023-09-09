use std::{collections::HashMap, fmt::Write, sync::OnceLock};

use chrono::{DateTime, NaiveDate, Utc};
use futures::{future, TryStreamExt};
use indicatif::{ProgressBar, ProgressState, ProgressStyle};
use scylla::{
    prepared_statement::PreparedStatement, FromUserType, IntoUserType, Session, SessionBuilder,
    ValueList,
};
use sea_orm::{entity::*, query::*, Database, DatabaseConnection};
use urlencoding::encode;

use crate::{
    config::{DbConfig, ScyllaConfig},
    entity::{drive_file, emoji, following, note, note_edit, note_reaction, poll, poll_vote, user},
    error::Error,
};

pub(crate) struct Initializer {
    scylla: Session,
    postgres_url: String,
}

impl Initializer {
    pub(crate) async fn new(
        scylla_conf: &ScyllaConfig,
        postgres_conf: &DbConfig,
    ) -> Result<Self, Error> {
        let session = SessionBuilder::new()
            .known_nodes(&scylla_conf.nodes)
            .build()
            .await?;

        let conn_url = format!(
            "postgres://{}:{}@{}:{}/{}",
            postgres_conf.user,
            encode(&postgres_conf.pass),
            postgres_conf.host,
            postgres_conf.port,
            postgres_conf.db,
        );

        Ok(Self {
            scylla: session,
            postgres_url: conn_url,
        })
    }

    pub(crate) async fn setup(&self) -> Result<(), Error> {
        let pool = Database::connect(&self.postgres_url).await?;
        let db_backend = pool.get_database_backend();

        self.copy(&pool).await?;

        let fk_pairs = vec![
            ("channel_note_pining", "FK_10b19ef67d297ea9de325cd4502"),
            ("clip_note", "FK_a012eaf5c87c65da1deb5fdbfa3"),
            ("muted_note", "FK_70ab9786313d78e4201d81cdb89"),
            ("note_favorite", "FK_0e00498f180193423c992bc4370"),
            ("note_unread", "FK_e637cba4dc4410218c4251260e4"),
            ("note_watching", "FK_03e7028ab8388a3f5e3ce2a8619"),
            ("promo_note", "FK_e263909ca4fe5d57f8d4230dd5c"),
            ("promo_read", "FK_a46a1a603ecee695d7db26da5f4"),
            ("user_note_pining", "FK_68881008f7c3588ad7ecae471cf"),
        ];
        for (table, fk) in fk_pairs {
            pool.execute(Statement::from_string(
                db_backend.to_owned(),
                format!("ALTER TABLE {} DROP CONSTRAINT \"{}\"", table, fk),
            ))
            .await?;
        }

        let tables = vec![
            "note_reaction",
            "note_edit",
            "poll",
            "poll_vote",
            "notification",
            "note",
        ];
        for table in tables {
            pool.execute(Statement::from_string(
                db_backend,
                format!("DROP TABLE {}", table),
            ))
            .await?;
        }

        Ok(())
    }

    async fn copy(&self, db: &DatabaseConnection) -> Result<(), Error> {
        let note_prepared = self.scylla.prepare(INSERT_NOTE).await?;
        let home_prepared = self.scylla.prepare(INSERT_HOME_TIMELINE).await?;
        let reaction_prepared = self.scylla.prepare(INSERT_REACTION).await?;

        let num_notes: i64 = note::Entity::find()
            .select_only()
            .column_as(note::Column::Id.count(), "count")
            .into_tuple()
            .one(db)
            .await?
            .unwrap_or_default();

        let num_reactions: i64 = note_reaction::Entity::find()
            .select_only()
            .column_as(note_reaction::Column::Id.count(), "count")
            .into_tuple()
            .one(db)
            .await?
            .unwrap_or_default();

        println!("Copying notes from PostgreSQL to ScyllaDB.");

        const PB_TMPL: &str =
            "{spinner:.green} [{elapsed_precise}] [{wide_bar:.cyan/blue}] {pos}/{len} ({eta})";
        let pb_style = ProgressStyle::with_template(PB_TMPL)
            .unwrap()
            .progress_chars("#>-");

        let note_pb = ProgressBar::new(num_notes as u64).with_style(pb_style.to_owned());
        let reaction_pb = ProgressBar::new(num_reactions as u64).with_style(pb_style.to_owned());

        let mut notes = note::Entity::find()
            .order_by_asc(note::Column::Id)
            .stream(db)
            .await?;
        let mut note_tasks = Vec::new();
        while let Some(note) = notes.try_next().await? {
            note_tasks.push(self.copy_note(note, db, &note_prepared, &home_prepared, &note_pb));
        }
        let mut reactions = note_reaction::Entity::find()
            .order_by_asc(note_reaction::Column::Id)
            .stream(db)
            .await?;
        let mut reaction_tasks = Vec::new();
        while let Some(reaction) = reactions.try_next().await? {
            reaction_tasks.push(self.copy_reaction(reaction, &reaction_prepared, &reaction_pb));
        }

        future::try_join_all(note_tasks).await?;
        future::try_join_all(reaction_tasks).await?;

        Ok(())
    }

    async fn copy_note(
        &self,
        note: note::Model,
        db: &DatabaseConnection,
        prepared_note: &PreparedStatement,
        prepared_home: &PreparedStatement,
        pb: &ProgressBar,
    ) -> Result<(), Error> {
        let reply = match &note.reply_id {
            None => None,
            Some(id) => note::Entity::find_by_id(id).one(db).await?,
        };
        let renote = match &note.renote_id {
            None => None,
            Some(id) => note::Entity::find_by_id(id).one(db).await?,
        };

        let files = get_attached_files(Some(note.to_owned()), db).await?;
        let reply_files = get_attached_files(reply.to_owned(), db).await?;
        let renote_files = get_attached_files(renote.to_owned(), db).await?;

        let note_poll = note.find_related(poll::Entity).one(db).await?;
        let poll_type = match note_poll {
            None => None,
            Some(v) => Some(PollType {
                multiple: v.multiple,
                expires_at: v.expires_at.map(Into::into),
                choices: HashMap::from_iter(
                    v.choices
                        .iter()
                        .enumerate()
                        .map(|(i, v)| ((i + 1) as i32, v.to_string())),
                ),
            }),
        };

        let reactions: HashMap<String, i32> = match note.reactions.as_object() {
            None => HashMap::new(),
            Some(obj) => HashMap::from_iter(
                obj.into_iter()
                    .map(|(k, v)| (k.to_string(), v.as_i64().unwrap_or_default() as i32)),
            ),
        };
        let edits = note.find_related(note_edit::Entity).all(db).await?;
        let edits = edits.iter().map(|v| async {
            let v = v.to_owned();
            Ok(NoteEditHistoryType {
                content: v.text,
                cw: v.cw,
                files: get_files(v.file_ids, db).await?,
                updated_at: v.updated_at.into(),
            })
        });
        let edits: Vec<Result<NoteEditHistoryType, Error>> = futures::future::join_all(edits).await;
        let edits: Vec<NoteEditHistoryType> = edits
            .iter()
            .filter_map(|v| v.as_ref().ok())
            .cloned()
            .collect();

        let scylla_note = NoteTable {
            created_at_date: note.created_at.date_naive(),
            created_at: note.created_at.into(),
            id: note.id.to_owned(),
            visibility: note.visibility.to_value(),
            content: note.text,
            name: note.name,
            cw: note.cw,
            local_only: note.local_only,
            renote_count: note.renote_count as i32,
            replies_count: note.replies_count as i32,
            uri: note.uri,
            url: note.url,
            score: note.score,
            files,
            visible_user_ids: note.visible_user_ids,
            mentions: note.mentions,
            mentioned_remote_users: note.mentioned_remote_users,
            emojis: note.emojis,
            tags: note.tags,
            has_poll: poll_type.is_some(),
            poll: poll_type,
            thread_id: note.thread_id,
            channel_id: note.channel_id,
            user_id: note.user_id.to_owned(),
            user_host: note.user_host,
            reply_id: note.reply_id,
            reply_user_id: note.reply_user_id,
            reply_user_host: note.reply_user_host,
            reply_content: reply.as_ref().map(|v| v.text.to_owned()).flatten(),
            reply_cw: reply.as_ref().map(|v| v.cw.to_owned()).flatten(),
            reply_files,
            renote_id: note.renote_id,
            renote_user_id: note.renote_user_id,
            renote_user_host: note.renote_user_host,
            renote_content: renote.as_ref().map(|v| v.text.to_owned()).flatten(),
            renote_cw: renote.as_ref().map(|v| v.cw.to_owned()).flatten(),
            renote_files,
            reactions,
            note_edit: edits,
            updated_at: note.updated_at.map(Into::into),
        };

        self.scylla
            .execute(prepared_note, scylla_note.to_owned())
            .await?;

        let mut home_tasks = Vec::new();
        let mut local_followers = following::Entity::find()
            .select_only()
            .column(following::Column::FollowerId)
            .filter(following::Column::FolloweeId.eq(note.user_id))
            .filter(following::Column::FollowerHost.is_null())
            .into_tuple::<String>()
            .stream(db)
            .await?;

        while let Some(follower_id) = local_followers.try_next().await? {
            let s_note = scylla_note.to_owned();
            let home = HomeTimelineTable {
                feed_user_id: follower_id,
                created_at_date: s_note.created_at_date,
                created_at: s_note.created_at,
                id: s_note.id,
                visibility: s_note.visibility,
                content: s_note.content,
                name: s_note.name,
                cw: s_note.cw,
                local_only: s_note.local_only,
                renote_count: s_note.renote_count,
                replies_count: s_note.replies_count,
                uri: s_note.uri,
                url: s_note.url,
                score: s_note.score,
                files: s_note.files,
                visible_user_ids: s_note.visible_user_ids,
                mentions: s_note.mentions,
                mentioned_remote_users: s_note.mentioned_remote_users,
                emojis: s_note.emojis,
                tags: s_note.tags,
                has_poll: s_note.has_poll,
                poll: s_note.poll,
                thread_id: s_note.thread_id,
                channel_id: s_note.channel_id,
                user_id: s_note.user_id,
                user_host: s_note.user_host,
                reply_id: s_note.reply_id,
                reply_user_id: s_note.reply_user_id,
                reply_user_host: s_note.reply_user_host,
                reply_content: s_note.reply_content,
                reply_cw: s_note.reply_cw,
                reply_files: s_note.reply_files,
                renote_id: s_note.renote_id,
                renote_user_id: s_note.renote_user_id,
                renote_user_host: s_note.renote_user_host,
                renote_content: s_note.renote_content,
                renote_cw: s_note.renote_cw,
                renote_files: s_note.renote_files,
                reactions: s_note.reactions,
                note_edit: s_note.note_edit,
                updated_at: s_note.updated_at,
            };
            home_tasks.push(self.scylla.execute(prepared_home, home));
        }
        future::try_join_all(home_tasks).await?;

        pb.inc(1);
        Ok(())
    }

    async fn copy_reaction(
        &self,
        reaction: note_reaction::Model,
        prepared: &PreparedStatement,
        pb: &ProgressBar,
    ) -> Result<(), Error> {
        let scylla_reaction = ReactionTable {
            id: reaction.id,
            note_id: reaction.note_id,
            user_id: reaction.user_id,
            reaction: reaction.reaction,
            created_at: reaction.created_at.into(),
        };
        self.scylla.execute(prepared, scylla_reaction).await?;

        pb.inc(1);
        Ok(())
    }
}

fn map_drive_file(file: drive_file::Model) -> DriveFileType {
    DriveFileType {
        id: file.id,
        r#type: file.r#type,
        created_at: file.created_at.into(),
        name: file.name,
        comment: file.comment,
        blurhash: file.blurhash,
        url: file.url,
        thumbnail_url: file.thumbnail_url,
        is_sensitive: file.is_sensitive,
        is_link: file.is_link,
        md5: file.md5,
        size: file.size,
        width: file
            .properties
            .get("width")
            .filter(|v| v.is_number())
            .map(|v| v.as_i64().unwrap() as i32),
        height: file
            .properties
            .get("height")
            .filter(|v| v.is_number())
            .map(|v| v.as_i64().unwrap() as i32),
    }
}

async fn get_attached_files(
    note: Option<note::Model>,
    db: &DatabaseConnection,
) -> Result<Vec<DriveFileType>, Error> {
    match note {
        None => Ok(vec![]),
        Some(v) => Ok(get_files(v.file_ids, db).await?),
    }
}

async fn get_files(
    file_ids: Vec<String>,
    db: &DatabaseConnection,
) -> Result<Vec<DriveFileType>, Error> {
    if file_ids.is_empty() {
        Ok(vec![])
    } else {
        let files = drive_file::Entity::find()
            .filter(drive_file::Column::Id.is_in(file_ids))
            .all(db)
            .await?;
        Ok(files.iter().map(|v| map_drive_file(v.to_owned())).collect())
    }
}

#[derive(Debug, Clone, IntoUserType, FromUserType)]
struct DriveFileType {
    id: String,
    r#type: String,
    #[scylla_crate(rename = "createdAt")]
    created_at: DateTime<Utc>,
    name: String,
    comment: Option<String>,
    blurhash: Option<String>,
    url: String,
    #[scylla_crate(rename = "thumbnailUrl")]
    thumbnail_url: Option<String>,
    #[scylla_crate(rename = "isSensitive")]
    is_sensitive: bool,
    #[scylla_crate(rename = "isLink")]
    is_link: bool,
    md5: String,
    size: i32,
    width: Option<i32>,
    height: Option<i32>,
}

#[derive(Debug, Clone, IntoUserType, FromUserType)]
struct NoteEditHistoryType {
    content: Option<String>,
    cw: Option<String>,
    files: Vec<DriveFileType>,
    #[scylla_crate(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, IntoUserType, FromUserType)]
struct PollType {
    #[scylla_crate(rename = "expiresAt")]
    expires_at: Option<DateTime<Utc>>,
    multiple: bool,
    choices: HashMap<i32, String>,
}

#[derive(Clone, ValueList)]
struct NoteTable {
    created_at_date: NaiveDate,
    created_at: DateTime<Utc>,
    id: String,
    visibility: String,
    content: Option<String>,
    name: Option<String>,
    cw: Option<String>,
    local_only: bool,
    renote_count: i32,
    replies_count: i32,
    uri: Option<String>,
    url: Option<String>,
    score: i32,
    files: Vec<DriveFileType>,
    visible_user_ids: Vec<String>,
    mentions: Vec<String>,
    mentioned_remote_users: String,
    emojis: Vec<String>,
    tags: Vec<String>,
    has_poll: bool,
    poll: Option<PollType>,
    thread_id: Option<String>,
    channel_id: Option<String>,
    user_id: String,
    user_host: Option<String>,
    reply_id: Option<String>,
    reply_user_id: Option<String>,
    reply_user_host: Option<String>,
    reply_content: Option<String>,
    reply_cw: Option<String>,
    reply_files: Vec<DriveFileType>,
    renote_id: Option<String>,
    renote_user_id: Option<String>,
    renote_user_host: Option<String>,
    renote_content: Option<String>,
    renote_cw: Option<String>,
    renote_files: Vec<DriveFileType>,
    reactions: HashMap<String, i32>,
    note_edit: Vec<NoteEditHistoryType>,
    updated_at: Option<DateTime<Utc>>,
}

const INSERT_NOTE: &str = r#"
INSERT INTO note (
"createdAtDate",
"createdAt",
"id",
"visibility",
"content",
"name",
"cw",
"localOnly",
"renoteCount",
"repliesCount",
"uri",
"url",
"score",
"files",
"visibleUserIds",
"mentions",
"mentionedRemoteUsers",
"emojis",
"tags",
"hasPoll",
"poll",
"threadId",
"channelId",
"userId",
"userHost",
"replyId",
"replyUserId",
"replyUserHost",
"replyContent",
"replyCw",
"replyFiles",
"renoteId",
"renoteUserId",
"renoteUserHost",
"renoteContent",
"renoteCw",
"renoteFiles",
"reactions",
"noteEdit",
"updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#;

#[derive(ValueList)]
struct HomeTimelineTable {
    feed_user_id: String,
    created_at_date: NaiveDate,
    created_at: DateTime<Utc>,
    id: String,
    visibility: String,
    content: Option<String>,
    name: Option<String>,
    cw: Option<String>,
    local_only: bool,
    renote_count: i32,
    replies_count: i32,
    uri: Option<String>,
    url: Option<String>,
    score: i32,
    files: Vec<DriveFileType>,
    visible_user_ids: Vec<String>,
    mentions: Vec<String>,
    mentioned_remote_users: String,
    emojis: Vec<String>,
    tags: Vec<String>,
    has_poll: bool,
    poll: Option<PollType>,
    thread_id: Option<String>,
    channel_id: Option<String>,
    user_id: String,
    user_host: Option<String>,
    reply_id: Option<String>,
    reply_user_id: Option<String>,
    reply_user_host: Option<String>,
    reply_content: Option<String>,
    reply_cw: Option<String>,
    reply_files: Vec<DriveFileType>,
    renote_id: Option<String>,
    renote_user_id: Option<String>,
    renote_user_host: Option<String>,
    renote_content: Option<String>,
    renote_cw: Option<String>,
    renote_files: Vec<DriveFileType>,
    reactions: HashMap<String, i32>,
    note_edit: Vec<NoteEditHistoryType>,
    updated_at: Option<DateTime<Utc>>,
}

const INSERT_HOME_TIMELINE: &str = r#"
INSERT INTO home_timeline (
"feedUserId",
"createdAtDate",
"createdAt",
"id",
"visibility",
"content",
"name",
"cw",
"localOnly",
"renoteCount",
"repliesCount",
"uri",
"url",
"score",
"files",
"visibleUserIds",
"mentions",
"mentionedRemoteUsers",
"emojis",
"tags",
"hasPoll",
"poll",
"threadId",
"channelId",
"userId",
"userHost",
"replyId",
"replyUserId",
"replyUserHost",
"replyContent",
"replyCw",
"replyFiles",
"renoteId",
"renoteUserId",
"renoteUserHost",
"renoteContent",
"renoteCw",
"renoteFiles",
"reactions",
"noteEdit",
"updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#;

#[derive(ValueList)]
struct ReactionTable {
    id: String,
    note_id: String,
    user_id: String,
    reaction: String,
    created_at: DateTime<Utc>,
}

const INSERT_REACTION: &str = r#"INSERT INTO reaction ("id", "noteId", "userId", "reaction", "createdAt") VALUES (?, ?, ?, ?, ?)"#;

#[derive(ValueList)]
struct PollVoteTable {
    note_id: String,
    user_id: String,
    user_host: Option<String>,
    choice: Vec<i32>,
    created_at: DateTime<Utc>,
}

const INSERT_POLL_VOTE: &str = r#"INSERT INTO poll_vote ("noteId", "userId", "userHost", "choice", "createdAt") VALUES (?, ?, ?, ?, ?)"#;

#[derive(ValueList)]
struct NotificationTable {
    target_id: String,
    created_at_date: NaiveDate,
    created_at: DateTime<Utc>,
    id: String,
    notifier_id: Option<String>,
    notifier_host: Option<String>,
    r#type: String,
    entity_id: Option<String>,
    reatcion: Option<String>,
    choice: Option<i32>,
    custom_body: Option<String>,
    custom_icon: Option<String>,
}

const INSERT_NOTIFICATION: &str = r#"INSERT INTO notification ("targetId", "createdAtDate", "createdAt", "id", "notifierId", "notifierHost", "type", "entityId", "reaction", "choice", "customBody", "customHeader", "customIcon") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#;
