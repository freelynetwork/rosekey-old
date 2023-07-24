import config from "@/config/index.js";
import { DriveFile } from "@/models/entities/drive-file.js";
import { Client } from "cassandra-driver";

function newClient(): Client | null {
	if (!config.scylla) {
		return null;
	}

	return new Client({
		contactPoints: config.scylla.nodes,
		localDataCenter: config.scylla.localDataCentre,
		keyspace: config.scylla.keyspace,
	});
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
				"visibleUsersId",
				"mentions",
				"emojis",
				"tags",
				"hasPoll",
				"threadId",
				"channelId",
				"channelName",
				"userId",
				"replyId",
				"renoteId",
				"reactions",
				"reactionEmojis",
				"noteEdit",
				"updatedAt"
			)
			VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		select: {
			byDate: `SELECT * FROM note WHERE "createdAtDate" = ? AND "createdAt" < ?`,
			byId: `SELECT * FROM note WHERE "id" IN ?`,
			byUri: `SELECT * FROM note WHERE "uri" = ?`,
			byUrl: `SELECT * FROM note WHERE "url" = ?`,
			byUserId: `SELECT * FROM note_by_userid WHERE "userId" = ? AND "createdAt" < ?`,
		},
		delete: `DELETE FROM note WHERE "createdAtDate" = ? AND "createdAt" = ?`,
		update: {
			renoteCount: `UPDATE note SET "renoteCount" = ?, "score" = ? WHERE "createdAtDate" = ? AND "createdAt" = ? IF EXISTS`,
			reactions: `UPDATE note SET "reactions" = ?, "score" = ? WHERE "createdAtDate" = ? AND "createdAt" = ? IF EXISTS`,
		},
	},
	reaction: {
		insert: `INSERT INTO reaction
			("id", "noteId", "userId", "reaction", "emoji", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?)`,
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
	width: number;
	height: number;
}
