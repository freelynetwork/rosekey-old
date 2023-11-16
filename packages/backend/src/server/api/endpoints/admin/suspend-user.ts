import define from "@/server/api/define.js";
import deleteFollowing from "@/services/following/delete.js";
import { Users, Followings, Notifications } from "@/models/index.js";
import type { User } from "@/models/entities/user.js";
import { insertModerationLog } from "@/services/insert-moderation-log.js";
import { doPostSuspend } from "@/services/suspend-user.js";
import { publishUserEvent } from "@/services/stream.js";
import { scyllaClient } from "@/db/scylla.js";
import { SuspendedUsersCache } from "@/misc/cache.js";
import {
	localUserByIdCache,
	userByIdCache,
	userDenormalizedCache,
} from "@/services/user-cache.js";

export const meta = {
	tags: ["admin"],

	requireCredential: true,
	requireModerator: true,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		userId: { type: "string", format: "misskey:id" },
	},
	required: ["userId"],
} as const;

export default define(meta, paramDef, async (ps, me) => {
	const user = await Users.findOneBy({ id: ps.userId });

	if (user == null) {
		throw new Error("user not found");
	}

	if (user.isAdmin) {
		throw new Error("cannot suspend admin");
	}

	if (user.isModerator) {
		throw new Error("cannot suspend moderator");
	}

	await userDenormalizedCache.delete(user.id);
	await userByIdCache.delete(user.id);
	await SuspendedUsersCache.init().then((cache) => cache.add(user.id));
	await Users.update(user.id, {
		isSuspended: true,
	});

	insertModerationLog(me, "suspend", {
		targetId: user.id,
	});

	// Terminate streaming
	if (Users.isLocalUser(user)) {
		await localUserByIdCache.delete(user.id);
		publishUserEvent(user.id, "terminate", {});
	}

	(async () => {
		await doPostSuspend(user).catch((e) => {});
		await unFollowAll(user).catch((e) => {});
		await readAllNotify(user).catch((e) => {});
	})();
});

async function unFollowAll(follower: User) {
	const followings = await Followings.findBy({
		followerId: follower.id,
	});

	for (const following of followings) {
		const followee = await Users.findOneBy({
			id: following.followeeId,
		});

		if (followee == null) {
			throw new Error(`Cant find followee ${following.followeeId}`);
		}

		await deleteFollowing(follower, followee, true);
	}
}

async function readAllNotify(notifier: User) {
	if (scyllaClient) {
		// FIXME: all notifications are automatically read at the moment
		return;
	}

	await Notifications.update(
		{
			notifierId: notifier.id,
			isRead: false,
		},
		{
			isRead: true,
		},
	);
}
