import type { CacheableRemoteUser } from "@/models/entities/user.js";
import { Notes } from "@/models/index.js";
import deleteNote from "@/services/note/delete.js";
import type { IAnnounce } from "../../type.js";
import { getApId } from "../../type.js";

export const undoAnnounce = async (
	actor: CacheableRemoteUser,
	activity: IAnnounce,
): Promise<string> => {
	const uri = getApId(activity);

	const note = await Notes.findOneBy({
		uri,
		userId: actor.id,
	});

	if (!note) return "skip: no such Announce";

	await deleteNote(actor, note);
	return "ok: deleted";
};
