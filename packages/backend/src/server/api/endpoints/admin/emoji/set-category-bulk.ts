import define from "@/server/api/define.js";
import { Emojis } from "@/models/index.js";
import { In } from "typeorm";
import { db } from "@/db/postgre.js";

export const meta = {
	tags: ["admin"],

	requireCredential: true,
	requireModerator: true,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		ids: {
			type: "array",
			items: {
				type: "string",
				format: "misskey:id",
			},
		},
		category: {
			type: "string",
			nullable: true,
			description: "Use `null` to reset the category.",
		},
	},
	required: ["ids"],
} as const;

export default define(meta, paramDef, async (ps) => {
	await Emojis.update(
		{
			id: In(ps.ids),
		},
		{
			updatedAt: new Date(),
			category: ps.category,
		},
	);

	await db.queryResultCache!.remove(["meta_emojis"]);
});
