import { UserGroups } from "@/models/index.js";
import define from "@/server/api/define.js";
import { ApiError } from "@/server/api/error.js";

export const meta = {
	tags: ["groups"],

	requireCredential: true,

	kind: "write:user-groups",

	description: "Delete an existing group.",

	errors: {
		noSuchGroup: {
			message: "No such group.",
			code: "NO_SUCH_GROUP",
			id: "63dbd64c-cd77-413f-8e08-61781e210b38",
		},
	},
} as const;

export const paramDef = {
	type: "object",
	properties: {
		groupId: { type: "string", format: "misskey:id" },
	},
	required: ["groupId"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const userGroup = await UserGroups.findOneBy({
		id: ps.groupId,
		userId: user.id,
	});

	if (userGroup == null) {
		throw new ApiError(meta.errors.noSuchGroup);
	}

	await UserGroups.delete(userGroup.id);
});
