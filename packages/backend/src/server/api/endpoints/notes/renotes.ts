import { Notes } from "@/models/index.js";
import define from "../../define.js";
import { getNote } from "../../common/getters.js";
import { ApiError } from "../../error.js";
import { generateVisibilityQuery } from "../../common/generate-visibility-query.js";
import { generateMutedUserQuery } from "../../common/generate-muted-user-query.js";
import { makePaginationQuery } from "../../common/make-pagination-query.js";
import { generateBlockedUserQuery } from "../../common/generate-block-query.js";
import {
	ScyllaNote,
	execTimelineQuery,
	filterBlockedUser,
	filterMutedUser,
	filterVisibility,
	scyllaClient,
} from "@/db/scylla.js";
import {
	InstanceMutingsCache,
	LocalFollowingsCache,
	UserBlockedCache,
	UserMutingsCache,
} from "@/misc/cache.js";

export const meta = {
	tags: ["notes"],

	requireCredential: false,
	requireCredentialPrivateMode: true,

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
		noSuchNote: {
			message: "No such note.",
			code: "NO_SUCH_NOTE",
			id: "12908022-2e21-46cd-ba6a-3edaf6093f46",
		},
	},
} as const;

export const paramDef = {
	type: "object",
	properties: {
		noteId: { type: "string", format: "misskey:id" },
		userId: { type: "string", format: "misskey:id" },
		limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: "string", format: "misskey:id" },
		untilId: { type: "string", format: "misskey:id" },
	},
	required: ["noteId"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const note = await getNote(ps.noteId, user).catch((err) => {
		if (err.id === "9725d0ce-ba28-4dde-95a7-2cbb2c15de24")
			throw new ApiError(meta.errors.noSuchNote);
		throw err;
	});

	if (scyllaClient) {
		let [
			followingUserIds,
			mutedUserIds,
			mutedInstances,
			blockerIds,
		]: string[][] = [];
		if (user) {
			[followingUserIds, mutedUserIds, mutedInstances, blockerIds] =
				await Promise.all([
					LocalFollowingsCache.init(user.id).then((cache) => cache.getAll()),
					UserMutingsCache.init(user.id).then((cache) => cache.getAll()),
					InstanceMutingsCache.init(user.id).then((cache) => cache.getAll()),
					UserBlockedCache.init(user.id).then((cache) => cache.getAll()),
				]);
		}

		const filter = async (notes: ScyllaNote[]) => {
			let filtered = notes.filter((n) => n.renoteId === note.id);
			if (ps.userId) {
				filtered = notes.filter((n) => n.userId === ps.userId);
			}
			filtered = await filterVisibility(filtered, user, followingUserIds);
			if (user) {
				filtered = await filterMutedUser(
					filtered,
					user,
					mutedUserIds,
					mutedInstances,
				);
				filtered = await filterBlockedUser(filtered, user, blockerIds);
			}
			return filtered;
		};

		const foundNotes = await execTimelineQuery(ps, filter, 1);
		return await Notes.packMany(foundNotes.slice(0, ps.limit), user, {
			scyllaNote: true,
		});
	}

	const query = makePaginationQuery(
		Notes.createQueryBuilder("note"),
		ps.sinceId,
		ps.untilId,
	).andWhere("note.renoteId = :renoteId", { renoteId: note.id });

	if (ps.userId) {
		query.andWhere("note.userId = :userId", { userId: ps.userId });
	}

	generateVisibilityQuery(query, user);
	if (user) generateMutedUserQuery(query, user);
	if (user) generateBlockedUserQuery(query, user);

	// We fetch more than requested because some may be filtered out, and if there's less than
	// requested, the pagination stops.
	const found = [];
	const take = Math.floor(ps.limit * 1.5);
	let skip = 0;
	while (found.length < ps.limit) {
		const notes = await query.take(take).skip(skip).getMany();
		found.push(...(await Notes.packMany(notes, user)));
		skip += take;
		if (notes.length < take) break;
	}

	if (found.length > ps.limit) {
		found.length = ps.limit;
	}

	return found;
});
