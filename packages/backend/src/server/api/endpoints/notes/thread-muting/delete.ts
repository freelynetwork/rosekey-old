import { NoteThreadMutings } from "@/models/index.js";
import { getNote } from "@/server/api/common/getters.js";
import define from "@/server/api/define.js";
import { ApiError } from "@/server/api/error.js";

export const meta = {
	tags: ["notes"],

	requireCredential: true,

	kind: "write:account",

	errors: {
		noSuchNote: {
			message: "No such note.",
			code: "NO_SUCH_NOTE",
			id: "bddd57ac-ceb3-b29d-4334-86ea5fae481a",
		},
	},
} as const;

export const paramDef = {
	type: "object",
	properties: {
		noteId: { type: "string", format: "misskey:id" },
	},
	required: ["noteId"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const note = await getNote(ps.noteId, user).catch((err) => {
		if (err.id === "9725d0ce-ba28-4dde-95a7-2cbb2c15de24")
			throw new ApiError(meta.errors.noSuchNote);
		throw err;
	});

	await NoteThreadMutings.delete({
		threadId: note.threadId || note.id,
		userId: user.id,
	});
});
