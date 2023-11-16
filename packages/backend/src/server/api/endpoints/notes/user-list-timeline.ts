import { Brackets } from "typeorm";
import { UserLists, UserListJoinings, Notes } from "@/models/index.js";
import { activeUsersChart } from "@/services/chart/index.js";
import {
	type ScyllaNote,
	scyllaClient,
	filterVisibility,
	execPaginationQuery,
} from "@/db/scylla.js";
import { LocalFollowingsCache } from "@/misc/cache.js";
import define from "@/server/api/define.js";
import { ApiError } from "@/server/api/error.js";
import { makePaginationQuery } from "@/server/api/common/make-pagination-query.js";
import { generateVisibilityQuery } from "@/server/api/common/generate-visibility-query.js";

export const meta = {
	tags: ["notes", "lists"],

	requireCredential: true,

	res: {
		type: "array",
		optional: false,
		nullable: false,
		items: {
			type: "object",
			optional: false,
			nullable: false,
			ref: "Note",
		},
	},

	errors: {
		noSuchList: {
			message: "No such list.",
			code: "NO_SUCH_LIST",
			id: "8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff",
		},
		queryError: {
			message: "Please follow more users.",
			code: "QUERY_ERROR",
			id: "620763f4-f621-4533-ab33-0577a1a3c343",
		},
	},
} as const;

export const paramDef = {
	type: "object",
	properties: {
		listId: { type: "string", format: "misskey:id" },
		limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: "string", format: "misskey:id" },
		untilId: { type: "string", format: "misskey:id" },
		sinceDate: { type: "integer" },
		untilDate: { type: "integer" },
		includeMyRenotes: { type: "boolean", default: true },
		includeRenotedMyNotes: { type: "boolean", default: true },
		includeLocalRenotes: { type: "boolean", default: true },
		withFiles: {
			type: "boolean",
			default: false,
			description: "Only show notes that have attached files.",
		},
	},
	required: ["listId"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const list = await UserLists.findOneBy({
		id: ps.listId,
		userId: user.id,
	});

	if (!list) {
		throw new ApiError(meta.errors.noSuchList);
	}

	if (scyllaClient) {
		const userIds = await UserListJoinings.find({
			select: ["userId"],
			where: {
				userListId: list.id,
			},
		}).then((lists) => lists.map(({ userId }) => userId));
		if (userIds.length === 0) {
			return await Notes.packMany([]);
		}

		const followingUserIds = await LocalFollowingsCache.init(user.id).then(
			(cache) => cache.getAll(),
		);
		const optFilter = (n: ScyllaNote) =>
			!n.renoteId || !!n.text || n.files.length > 0 || n.hasPoll;
		const filter = (notes: ScyllaNote[]) => {
			let filtered = filterVisibility(notes, user, followingUserIds);
			if (!ps.includeMyRenotes) {
				filtered = filtered.filter((n) => n.userId !== user.id || optFilter(n));
			}
			if (!ps.includeRenotedMyNotes) {
				filtered = filtered.filter(
					(n) => n.renoteUserId !== user.id || optFilter(n),
				);
			}
			if (!ps.includeLocalRenotes) {
				filtered = filtered.filter((n) => n.renoteUserHost || optFilter(n));
			}
			if (ps.withFiles) {
				filtered = filtered.filter((n) => n.files.length > 0);
			}
			filtered = filtered.filter((n) => n.visibility !== "hidden");
			return filtered;
		};

		const foundPacked = [];
		while (foundPacked.length < ps.limit) {
			const foundNotes = (
				(await execPaginationQuery(
					"list",
					{ ...ps, userIds },
					{ note: filter },
					user.id,
				)) as ScyllaNote[]
			)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
				.slice(0, ps.limit * 1.5); // Some may filtered out by Notes.packMany, thus we take more than ps.limit.
			foundPacked.push(...(await Notes.packMany(foundNotes, user)));
			if (foundNotes.length < ps.limit) break;
			ps.untilDate = foundNotes[foundNotes.length - 1].createdAt.getTime();
		}

		return foundPacked.slice(0, ps.limit);
	}

	//#region Construct query
	const query = makePaginationQuery(
		Notes.createQueryBuilder("note"),
		ps.sinceId,
		ps.untilId,
	)
		.innerJoin(
			UserListJoinings.metadata.targetName,
			"userListJoining",
			"userListJoining.userId = note.userId",
		)
		.leftJoinAndSelect("note.reply", "reply")
		.leftJoinAndSelect("note.renote", "renote")
		.andWhere("userListJoining.userListId = :userListId", {
			userListId: list.id,
		});

	generateVisibilityQuery(query, user);

	if (ps.includeMyRenotes === false) {
		query.andWhere(
			new Brackets((qb) => {
				qb.orWhere("note.userId != :meId", { meId: user.id });
				qb.orWhere("note.renoteId IS NULL");
				qb.orWhere("note.text IS NOT NULL");
				qb.orWhere("note.fileIds != '{}'");
				qb.orWhere(
					'0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)',
				);
			}),
		);
	}

	if (ps.includeRenotedMyNotes === false) {
		query.andWhere(
			new Brackets((qb) => {
				qb.orWhere("note.renoteUserId != :meId", { meId: user.id });
				qb.orWhere("note.renoteId IS NULL");
				qb.orWhere("note.text IS NOT NULL");
				qb.orWhere("note.fileIds != '{}'");
				qb.orWhere(
					'0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)',
				);
			}),
		);
	}

	if (ps.includeLocalRenotes === false) {
		query.andWhere(
			new Brackets((qb) => {
				qb.orWhere("note.renoteUserHost IS NOT NULL");
				qb.orWhere("note.renoteId IS NULL");
				qb.orWhere("note.text IS NOT NULL");
				qb.orWhere("note.fileIds != '{}'");
				qb.orWhere(
					'0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)',
				);
			}),
		);
	}

	if (ps.withFiles) {
		query.andWhere("note.fileIds != '{}'");
	}
	//#endregion

	process.nextTick(() => {
		if (user) {
			activeUsersChart.read(user);
		}
	});

	// We fetch more than requested because some may be filtered out, and if there's less than
	// requested, the pagination stops.
	const found = [];
	const take = Math.floor(ps.limit * 1.5);
	let skip = 0;
	try {
		while (found.length < ps.limit) {
			const notes = await query.take(take).skip(skip).getMany();
			found.push(...(await Notes.packMany(notes, user)));
			skip += take;
			if (notes.length < take) break;
		}
	} catch (error) {
		throw new ApiError(meta.errors.queryError);
	}

	if (found.length > ps.limit) {
		found.length = ps.limit;
	}

	return found;
});
