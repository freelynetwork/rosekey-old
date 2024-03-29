import { Pages } from "@/models/index.js";
import { makePaginationQuery } from "@/server/api/common/make-pagination-query.js";
import define from "@/server/api/define.js";

export const meta = {
	tags: ["users", "pages"],
	requireCredentialPrivateMode: true,

	description: "Show all pages this user created.",

	res: {
		type: "array",
		optional: false,
		nullable: false,
		items: {
			type: "object",
			optional: false,
			nullable: false,
			ref: "Page",
		},
	},
} as const;

export const paramDef = {
	type: "object",
	properties: {
		userId: { type: "string", format: "misskey:id" },
		limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: "string", format: "misskey:id" },
		untilId: { type: "string", format: "misskey:id" },
	},
	required: ["userId"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const query = makePaginationQuery(
		Pages.createQueryBuilder("page"),
		ps.sinceId,
		ps.untilId,
	)
		.andWhere("page.userId = :userId", { userId: ps.userId })
		.andWhere("page.visibility = 'public'")
		.andWhere("page.isPublic = true");

	const pages = await query.take(ps.limit).getMany();

	return await Pages.packMany(pages);
});
