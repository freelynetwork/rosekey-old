import config from "@/config/index.js";
import type { PopulatedEmoji } from "@/misc/populate-emojis.js";
import type { Channel } from "@/models/entities/channel.js";
import type { Note } from "@/models/entities/note.js";
import type { NoteReaction } from "@/models/entities/note-reaction.js";
import { Client, types, tracker } from "cassandra-driver";
import type { User } from "@/models/entities/user.js";
import {
	ChannelFollowingsCache,
	InstanceMutingsCache,
	LocalFollowingsCache,
	RenoteMutingsCache,
	UserBlockedCache,
	UserMutingsCache,
	userWordMuteCache,
} from "@/misc/cache.js";
import { getTimestamp } from "@/misc/gen-id.js";
import Logger from "@/services/logger.js";
import { UserProfiles } from "@/models/index.js";
import { getWordHardMute } from "@/misc/check-word-mute.js";
import type { UserProfile } from "@/models/entities/user-profile.js";

function newClient(): Client | null {
	if (!config.scylla) {
		return null;
	}

	const requestTracker = new tracker.RequestLogger({
		slowThreshold: 1000,
	});
	const client = new Client({
		contactPoints: config.scylla.nodes,
		localDataCenter: config.scylla.localDataCentre,
		keyspace: config.scylla.keyspace,
		requestTracker,
	});

	const logger = new Logger("scylla");
	client.on("log", (level, loggerName, message, _furtherInfo) => {
		const msg = `${loggerName} - ${message}`;
		switch (level) {
			case "info":
				logger.info(msg);
				break;
			case "warning":
				logger.warn(msg);
				break;
			case "error":
				logger.error(msg);
				break;
		}
	});
	client.on("slow", (message) => {
		logger.warn(message);
	});
	client.on("large", (message) => {
		logger.warn(message);
	});

	return client;
}

export const scyllaClient = newClient();

export const prepared = {
	note: {
		insert: `INSERT INTO note (
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
			)
			VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		select: {
			byDate: `SELECT * FROM note WHERE "createdAtDate" = ?`,
			byUri: `SELECT * FROM note WHERE "uri" = ?`,
			byUrl: `SELECT * FROM note WHERE "url" = ?`,
			byId: `SELECT * FROM note_by_id WHERE "id" IN ?`,
			byUserId: `SELECT * FROM note_by_user_id WHERE "userId" IN ?`,
			byRenoteId: `SELECT * FROM note_by_renote_id WHERE "renoteId" = ?`,
		},
		delete: `DELETE FROM note WHERE "createdAtDate" = ? AND "createdAt" = ? AND "userId" = ?`,
		update: {
			renoteCount: `UPDATE note SET
				"renoteCount" = ?,
				"score" = ?
				WHERE "createdAtDate" = ? AND "createdAt" = ? AND "userId" = ? IF EXISTS`,
			repliesCount: `UPDATE note SET
				"repliesCount" = ?
				WHERE "createdAtDate" = ? AND "createdAt" = ? AND "userId" = ? IF EXISTS`,
			reactions: `UPDATE note SET
				"emojis" = ?,
				"reactions" = ?,
				"score" = ?
				WHERE "createdAtDate" = ? AND "createdAt" = ? AND "userId" = ? IF EXISTS`,
		},
	},
	reaction: {
		insert: `INSERT INTO reaction
			("id", "noteId", "userId", "reaction", "emoji", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?)`,
		select: {
			byNoteId: `SELECT * FROM reaction_by_id WHERE "noteId" IN ?`,
			byUserId: `SELECT * FROM reaction_by_user_id WHERE "userId" IN ?`,
			byNoteAndUser: `SELECT * FROM reaction WHERE "noteId" IN ? AND "userId" IN ?`,
			byId: `SELECT * FROM reaction WHERE "id" IN ?`,
		},
		delete: `DELETE FROM reaction WHERE "noteId" = ? AND "userId" = ?`,
	},
};

export interface ScyllaDriveFile {
	id: string;
	type: string;
	createdAt: Date;
	name: string;
	comment: string | null;
	blurhash: string | null;
	url: string;
	thumbnailUrl: string;
	isSensitive: boolean;
	isLink: boolean;
	md5: string;
	size: number;
	width: number | null;
	height: number | null;
}

export interface ScyllaNoteEditHistory {
	content: string;
	cw: string;
	files: ScyllaDriveFile[];
	updatedAt: Date;
}

export type ScyllaNote = Note & {
	createdAtDate: Date;
	files: ScyllaDriveFile[];
	noteEdit: ScyllaNoteEditHistory[];
	replyText: string | null;
	replyCw: string | null;
	replyFiles: ScyllaDriveFile[];
	renoteText: string | null;
	renoteCw: string | null;
	renoteFiles: ScyllaDriveFile[];
};

export function parseScyllaNote(row: types.Row): ScyllaNote {
	const files: ScyllaDriveFile[] = row.get("files") ?? [];

	return {
		createdAtDate: row.get("createdAtDate"),
		createdAt: row.get("createdAt"),
		id: row.get("id"),
		visibility: row.get("visibility"),
		text: row.get("content") ?? null,
		name: row.get("name") ?? null,
		cw: row.get("cw") ?? null,
		localOnly: row.get("localOnly"),
		renoteCount: row.get("renoteCount"),
		repliesCount: row.get("repliesCount"),
		uri: row.get("uri") ?? null,
		url: row.get("url") ?? null,
		score: row.get("score"),
		files,
		fileIds: files.map((file) => file.id),
		attachedFileTypes: files.map((file) => file.type) ?? [],
		visibleUserIds: row.get("visibleUserIds") ?? [],
		mentions: row.get("mentions") ?? [],
		emojis: row.get("emojis") ?? [],
		tags: row.get("tags") ?? [],
		hasPoll: row.get("hasPoll") ?? false,
		threadId: row.get("threadId") ?? null,
		channelId: row.get("channelId") ?? null,
		userId: row.get("userId"),
		userHost: row.get("userHost") ?? null,
		replyId: row.get("replyId") ?? null,
		replyUserId: row.get("replyUserId") ?? null,
		replyUserHost: row.get("replyUserHost") ?? null,
		replyText: row.get("replyContent") ?? null,
		replyCw: row.get("replyCw") ?? null,
		replyFiles: row.get("replyFiles") ?? [],
		renoteId: row.get("renoteId") ?? null,
		renoteUserId: row.get("renoteUserId") ?? null,
		renoteUserHost: row.get("renoteUserHost") ?? null,
		renoteText: row.get("renoteContent") ?? null,
		renoteCw: row.get("renoteCw") ?? null,
		renoteFiles: row.get("renoteFiles") ?? [],
		reactions: row.get("reactions") ?? {},
		noteEdit: row.get("noteEdit") ?? [],
		updatedAt: row.get("updatedAt") ?? null,
		mentionedRemoteUsers: row.get("mentionedRemoteUsers") ?? "[]",
		/* unused postgres denormalization */
		channel: null,
		renote: null,
		reply: null,
		user: null,
	};
}

export interface ScyllaNoteReaction extends NoteReaction {
	emoji: PopulatedEmoji;
}

const QUERY_LIMIT = 1000; // TODO: should this be configurable?

export function parseScyllaReaction(row: types.Row): ScyllaNoteReaction {
	return {
		id: row.get("id"),
		noteId: row.get("noteId"),
		userId: row.get("userId"),
		reaction: row.get("reaction"),
		createdAt: row.get("createdAt"),
		emoji: row.get("emoji"),
	};
}

export function prepareNoteQuery(ps: {
	untilId?: string;
	untilDate?: number;
	sinceId?: string;
	sinceDate?: number;
	noteId?: string;
}): { query: string; untilDate: Date; sinceDate: Date | null } {
	const queryParts = [
		`${
			ps.noteId ? prepared.note.select.byRenoteId : prepared.note.select.byDate
		} AND "createdAt" < ?`,
	];

	let until = new Date();
	if (ps.untilId) {
		until = new Date(getTimestamp(ps.untilId));
	}
	if (ps.untilDate && ps.untilDate < until.getTime()) {
		until = new Date(ps.untilDate);
	}
	let since: Date | null = null;
	if (ps.sinceId) {
		since = new Date(getTimestamp(ps.sinceId));
	}
	if (ps.sinceDate && (!since || ps.sinceDate > since.getTime())) {
		since = new Date(ps.sinceDate);
	}
	if (since !== null) {
		queryParts.push(`AND "createdAt" > ?`);
	}

	queryParts.push(`LIMIT ${QUERY_LIMIT}`);

	const query = queryParts.join(" ");

	return {
		query,
		untilDate: until,
		sinceDate: since,
	};
}

export async function execNotePaginationQuery(
	ps: {
		limit: number;
		untilId?: string;
		untilDate?: number;
		sinceId?: string;
		sinceDate?: number;
		noteId?: string;
	},
	filter?: (_: ScyllaNote[]) => Promise<ScyllaNote[]>,
	maxPartitions = config.scylla?.sparseTimelineDays ?? 14,
): Promise<ScyllaNote[]> {
	if (!scyllaClient) return [];

	let { query, untilDate, sinceDate } = prepareNoteQuery(ps);

	let scannedPartitions = 0;
	const foundNotes: ScyllaNote[] = [];

	// Try to get posts of at most <maxPartitions> in the single request
	while (foundNotes.length < ps.limit && scannedPartitions < maxPartitions) {
		const params: (Date | string | string[] | number)[] = [];
		if (ps.noteId) {
			params.push(ps.noteId, untilDate);
		} else {
			params.push(untilDate, untilDate);
		}
		if (sinceDate) {
			params.push(sinceDate);
		}

		const result = await scyllaClient.execute(query, params, {
			prepare: true,
		});

		if (result.rowLength > 0) {
			const notes = result.rows.map(parseScyllaNote);
			foundNotes.push(...(filter ? await filter(notes) : notes));
			untilDate = notes[notes.length - 1].createdAt;
		}

		if (result.rowLength < QUERY_LIMIT) {
			// Reached the end of partition. Queries posts created one day before.
			scannedPartitions++;
			const yesterday = new Date(untilDate.getTime() - 86400000);
			yesterday.setUTCHours(23, 59, 59, 999);
			untilDate = yesterday;
			if (sinceDate && untilDate < sinceDate) break;
		}
	}

	return foundNotes;
}

export async function filterVisibility(
	notes: ScyllaNote[],
	user: { id: User["id"] } | null,
	followingIds?: User["id"][],
): Promise<ScyllaNote[]> {
	let filtered = notes;

	if (!user) {
		filtered = filtered.filter((note) =>
			["public", "home"].includes(note.visibility),
		);
	} else {
		let ids: User["id"][];
		if (followingIds) {
			ids = followingIds;
		} else {
			ids = await LocalFollowingsCache.init(user.id).then((cache) =>
				cache.getAll(),
			);
		}

		filtered = filtered.filter(
			(note) =>
				["public", "home"].includes(note.visibility) ||
				note.userId === user.id ||
				note.visibleUserIds.includes(user.id) ||
				note.mentions.includes(user.id) ||
				(note.visibility === "followers" &&
					(ids.includes(note.userId) || note.replyUserId === user.id)),
		);
	}

	return filtered;
}

export async function filterChannel(
	notes: ScyllaNote[],
	user: { id: User["id"] } | null,
	followingIds?: Channel["id"][],
): Promise<ScyllaNote[]> {
	let filtered = notes;

	if (!user) {
		filtered = filtered.filter((note) => !note.channelId);
	} else {
		const channelNotes = filtered.filter((note) => !!note.channelId);
		if (channelNotes.length > 0) {
			let followings: Channel["id"][];
			if (followingIds) {
				followings = followingIds;
			} else {
				followings = await ChannelFollowingsCache.init(user.id).then((cache) =>
					cache.getAll(),
				);
			}
			filtered = filtered.filter(
				(note) => !note.channelId || followings.includes(note.channelId),
			);
		}
	}

	return filtered;
}

export async function filterReply(
	notes: ScyllaNote[],
	withReplies: boolean,
	user: { id: User["id"] } | null,
): Promise<ScyllaNote[]> {
	let filtered = notes;

	if (!user) {
		filtered = filtered.filter(
			(note) => !note.replyId || note.replyUserId === note.userId,
		);
	} else if (!withReplies) {
		filtered = filtered.filter(
			(note) =>
				!note.replyId ||
				note.replyUserId === user.id ||
				note.userId === user.id ||
				note.replyUserId === note.userId,
		);
	}

	return filtered;
}

export async function filterMutedUser(
	notes: ScyllaNote[],
	user: { id: User["id"] },
	mutedIds?: User["id"][],
	mutedInstances?: UserProfile["mutedInstances"],
	exclude?: User,
): Promise<ScyllaNote[]> {
	let ids: User["id"][];
	let instances: UserProfile["mutedInstances"];

	if (mutedIds) {
		ids = mutedIds;
	} else {
		ids = await UserMutingsCache.init(user.id).then((cache) => cache.getAll());
	}

	if (mutedInstances) {
		instances = mutedInstances;
	} else {
		instances = await InstanceMutingsCache.init(user.id).then((cache) =>
			cache.getAll(),
		);
	}

	if (exclude) {
		ids = ids.filter((id) => id !== exclude.id);
	}

	return notes.filter(
		(note) =>
			!ids.includes(note.userId) &&
			!(note.replyUserId && ids.includes(note.replyUserId)) &&
			!(note.renoteUserId && ids.includes(note.renoteUserId)) &&
			!(note.userHost && instances.includes(note.userHost)) &&
			!(note.replyUserHost && instances.includes(note.replyUserHost)) &&
			!(note.renoteUserHost && instances.includes(note.renoteUserHost)),
	);
}

export async function filterMutedNote(
	notes: ScyllaNote[],
	user: { id: User["id"] },
	mutedWords?: string[][],
): Promise<ScyllaNote[]> {
	let words = mutedWords;

	if (!words) {
		words = await userWordMuteCache.fetchMaybe(user.id, () =>
			UserProfiles.findOne({
				select: ["mutedWords"],
				where: { userId: user.id },
			}).then((profile) => profile?.mutedWords),
		);
	}

	if (words && words.length > 0) {
		return notes.filter(
			(note) => !getWordHardMute(note, user, words as string[][]),
		);
	}

	return notes;
}

export async function filterBlockedUser(
	notes: ScyllaNote[],
	user: { id: User["id"] },
	blockerIds?: User["id"][],
): Promise<ScyllaNote[]> {
	let ids: User["id"][];

	if (blockerIds) {
		ids = blockerIds;
	} else {
		ids = await UserBlockedCache.init(user.id).then((cache) => cache.getAll());
	}

	return notes.filter(
		(note) =>
			!ids.includes(note.userId) &&
			!(note.replyUserId && ids.includes(note.replyUserId)) &&
			!(note.renoteUserId && ids.includes(note.renoteUserId)),
	);
}

export async function filterMutedRenotes(
	notes: ScyllaNote[],
	user: { id: User["id"] },
	muteeIds?: User["id"][],
): Promise<ScyllaNote[]> {
	let ids: User["id"][];

	if (muteeIds) {
		ids = muteeIds;
	} else {
		ids = await RenoteMutingsCache.init(user.id).then((cache) =>
			cache.getAll(),
		);
	}

	return notes.filter(
		(note) => note.text || !note.renoteId || !ids.includes(note.userId),
	);
}
