use scylla::{Session, SessionBuilder};
use sea_orm::{ConnectionTrait, Database, Statement};
use urlencoding::encode;

use crate::{
    config::{DbConfig, ScyllaConfig},
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
}