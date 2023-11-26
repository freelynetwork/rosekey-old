import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { id } from "../id.js";
import type { Clip } from "./clip.js";
import { User } from "./user.js";

@Entity()
export class Meta {
	@PrimaryColumn({
		type: "varchar",
		length: 32,
	})
	public id: string;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public name: string | null;

	@Column("varchar", {
		length: 1024,
		nullable: true,
	})
	public description: string | null;

	/**
	 * メンテナの名前
	 */
	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public maintainerEmail: string | null;

	@Column("boolean", {
		default: false,
	})
	public disableRegistration: boolean;

	@Column("boolean", {
		default: false,
	})
	public disableLocalTimeline: boolean;

	@Column("boolean", {
		default: true,
	})
	public disableRecommendedTimeline: boolean;

	@Column("boolean", {
		default: false,
	})
	public disableGlobalTimeline: boolean;

	@Column("varchar", {
		length: 256,
		default: "⭐",
	})
	public defaultReaction: string;

	@Column("varchar", {
		length: 64,
		array: true,
		default: "{}",
	})
	public langs: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public pinnedUsers: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public recommendedInstances: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public customMOTD: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public customSplashIcons: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public hiddenTags: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public blockedHosts: string[];

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public silencedHosts: string[];

	@Column("boolean", {
		default: false,
	})
	public secureMode: boolean;

	@Column("boolean", {
		default: false,
	})
	public privateMode: boolean;

	@Column("varchar", {
		length: 256,
		array: true,
		default: "{}",
	})
	public allowedHosts: string[];

	@Column("varchar", {
		length: 512,
		array: true,
		default: "{/featured,/channels,/explore,/pages,/about-firefish}",
	})
	public pinnedPages: string[];

	@Column({
		...id(),
		nullable: true,
	})
	public pinnedClipId: Clip["id"] | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public themeColor: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
		default: "/static-assets/badges/info.webp",
	})
	public mascotImageUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public backgroundImageUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public logoImageUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
		default: "/static-assets/badges/error.webp",
	})
	public errorImageUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column("boolean", {
		default: false,
	})
	public cacheRemoteFiles: boolean;

	@Column({
		...id(),
		nullable: true,
	})
	public proxyAccountId: User["id"] | null;

	@ManyToOne((type) => User, {
		onDelete: "SET NULL",
	})
	@JoinColumn()
	public proxyAccount: User | null;

	@Column("boolean", {
		default: false,
	})
	public emailRequiredForSignup: boolean;

	@Column("boolean", {
		default: false,
	})
	public enableHcaptcha: boolean;

	@Column("varchar", {
		length: 64,
		nullable: true,
	})
	public hcaptchaSiteKey: string | null;

	@Column("varchar", {
		length: 64,
		nullable: true,
	})
	public hcaptchaSecretKey: string | null;

	@Column("boolean", {
		default: false,
	})
	public enableRecaptcha: boolean;

	@Column("varchar", {
		length: 64,
		nullable: true,
	})
	public recaptchaSiteKey: string | null;

	@Column("varchar", {
		length: 64,
		nullable: true,
	})
	public recaptchaSecretKey: string | null;

	@Column("enum", {
		enum: ["none", "all", "local", "remote"],
		default: "none",
	})
	public sensitiveMediaDetection: "none" | "all" | "local" | "remote";

	@Column("enum", {
		enum: ["medium", "low", "high", "veryLow", "veryHigh"],
		default: "medium",
	})
	public sensitiveMediaDetectionSensitivity:
		| "medium"
		| "low"
		| "high"
		| "veryLow"
		| "veryHigh";

	@Column("boolean", {
		default: false,
	})
	public setSensitiveFlagAutomatically: boolean;

	@Column("boolean", {
		default: false,
	})
	public enableSensitiveMediaDetectionForVideos: boolean;

	@Column("integer", {
		default: 1024,
		comment: "Drive capacity of a local user (MB)",
	})
	public localDriveCapacityMb: number;

	@Column("integer", {
		default: 32,
		comment: "Drive capacity of a remote user (MB)",
	})
	public remoteDriveCapacityMb: number;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public summalyProxy: string | null;

	@Column("boolean", {
		default: false,
	})
	public enableEmail: boolean;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public email: string | null;

	@Column("boolean", {
		default: false,
	})
	public smtpSecure: boolean;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public smtpHost: string | null;

	@Column("integer", {
		nullable: true,
	})
	public smtpPort: number | null;

	@Column("varchar", {
		length: 1024,
		nullable: true,
	})
	public smtpUser: string | null;

	@Column("varchar", {
		length: 1024,
		nullable: true,
	})
	public smtpPass: string | null;

	@Column("boolean", {
		default: false,
	})
	public enableServiceWorker: boolean;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public swPublicKey: string | null;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public swPrivateKey: string | null;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public deeplAuthKey: string | null;

	@Column("boolean", {
		default: false,
	})
	public deeplIsPro: boolean;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public libreTranslateApiUrl: string | null;

	@Column("varchar", {
		length: 128,
		nullable: true,
	})
	public libreTranslateApiKey: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public ToSUrl: string | null;

	@Column("jsonb", {
		default: [],
		nullable: false,
	})
	public moreUrls: [string, string][];

	@Column("varchar", {
		length: 512,
		default: "https://git.joinfirefish.org/firefish/firefish",
		nullable: false,
	})
	public repositoryUrl: string;

	@Column("varchar", {
		length: 512,
		default: "https://git.joinfirefish.org/firefish/firefish/issues/new",
		nullable: true,
	})
	public feedbackUrl: string | null;

	@Column("varchar", {
		length: 8192,
		nullable: true,
	})
	public defaultLightTheme: string | null;

	@Column("varchar", {
		length: 8192,
		nullable: true,
	})
	public defaultDarkTheme: string | null;

	@Column("boolean", {
		default: false,
	})
	public useObjectStorage: boolean;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageBucket: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStoragePrefix: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageBaseUrl: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageEndpoint: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageRegion: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageAccessKey: string | null;

	@Column("varchar", {
		length: 512,
		nullable: true,
	})
	public objectStorageSecretKey: string | null;

	@Column("integer", {
		nullable: true,
	})
	public objectStoragePort: number | null;

	@Column("boolean", {
		default: true,
	})
	public objectStorageUseSSL: boolean;

	@Column("boolean", {
		default: true,
	})
	public objectStorageUseProxy: boolean;

	@Column("boolean", {
		default: false,
	})
	public objectStorageSetPublicRead: boolean;

	@Column("boolean", {
		default: true,
	})
	public objectStorageS3ForcePathStyle: boolean;

	@Column("boolean", {
		default: false,
	})
	public enableIpLogging: boolean;

	@Column("boolean", {
		default: true,
	})
	public enableActiveEmailValidation: boolean;

	@Column("jsonb", {
		default: {},
	})
	public experimentalFeatures: Record<string, unknown>;

	@Column("boolean", {
		default: false,
	})
	public enableServerMachineStats: boolean;

	@Column("boolean", {
		default: true,
	})
	public enableIdenticonGeneration: boolean;

	@Column("varchar", {
		length: 256,
		nullable: true,
	})
	public donationLink: string | null;
}
