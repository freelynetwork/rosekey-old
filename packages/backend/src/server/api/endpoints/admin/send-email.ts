import define from "@/server/api/define.js";
import { sendEmail } from "@/services/send-email.js";

export const meta = {
	tags: ["admin"],

	requireCredential: true,
	requireModerator: true,
} as const;

export const paramDef = {
	type: "object",
	properties: {
		to: { type: "string" },
		subject: { type: "string" },
		text: { type: "string" },
	},
	required: ["to", "subject", "text"],
} as const;

export default define(meta, paramDef, async (ps) => {
	await sendEmail(ps.to, ps.subject, ps.text, ps.text);
});
