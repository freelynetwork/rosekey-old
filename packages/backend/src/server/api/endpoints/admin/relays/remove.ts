import { removeRelay } from "@/services/relay.js";
import define from "../../../define.js";

export const meta = {
	tags: ["admin"],

	requireCredential: true,
	requireModerator: true,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		inbox: { type: "string" },
	},
	required: ["inbox"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	return await removeRelay(ps.inbox);
});
