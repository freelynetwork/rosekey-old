import { comparePassword } from "@/misc/password.js";
import { UserProfiles, Users } from "@/models/index.js";
import generateUserToken from "@/server/api/common/generate-native-user-token.js";
import define from "@/server/api/define.js";
import {
	publishInternalEvent,
	publishMainStream,
	publishUserEvent,
} from "@/services/stream.js";

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		password: { type: "string" },
	},
	required: ["password"],
} as const;

export default define(meta, paramDef, async (ps, user) => {
	const freshUser = await Users.findOneByOrFail({ id: user.id });
	const oldToken = freshUser.token;

	const profile = await UserProfiles.findOneByOrFail({ userId: user.id });

	// Compare password
	const same = await comparePassword(ps.password, profile.password!);

	if (!same) {
		throw new Error("incorrect password");
	}

	const newToken = generateUserToken();

	await Users.update(user.id, {
		token: newToken,
	});

	// Publish event
	publishInternalEvent("userTokenRegenerated", {
		id: user.id,
		oldToken,
		newToken,
	});
	publishMainStream(user.id, "myTokenRegenerated");

	// Terminate streaming
	setTimeout(() => {
		publishUserEvent(user.id, "terminate", {});
	}, 5000);
});
