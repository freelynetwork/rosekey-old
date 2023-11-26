import define from "@/server/api/define.js";
import { getJsonSchema } from "@/services/chart/core.js";
import { perUserReactionsChart } from "@/services/chart/index.js";

export const meta = {
	tags: ["charts", "users", "reactions"],
	requireCredentialPrivateMode: true,

	res: getJsonSchema(perUserReactionsChart.schema),

	allowGet: true,
	cacheSec: 60 * 60,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		span: { type: "string", enum: ["day", "hour"] },
		limit: { type: "integer", minimum: 1, maximum: 500, default: 30 },
		offset: { type: "integer", nullable: true, default: null },
		userId: { type: "string", format: "misskey:id" },
	},
	required: ["span", "userId"],
} as const;

export default define(meta, paramDef, async (ps) => {
	return await perUserReactionsChart.getChart(
		ps.span,
		ps.limit,
		ps.offset ? new Date(ps.offset) : null,
		ps.userId,
	);
});
