<template>
	<MkStickyContainer>
		<template #header
			><MkPageHeader :actions="headerActions" :tabs="headerTabs"
		/></template>
		<div style="overflow: clip">
			<MkSpacer :content-max="600" :margin-min="20">
				<div class="_formRoot znqjceqz">
					<div id="debug"></div>
					<div
						ref="containerEl"
						v-panel
						class="_formBlock about"
						:class="{ playing: easterEggEngine != null }"
					>
						<img
							src="/client-assets/about-icon.png"
							alt=""
							class="icon"
							draggable="false"
							@load="iconLoaded"
							@click="gravity"
						/>
						<div class="misskey">Rosekey</div>
						<div class="version">v{{ version }}</div>
						<span
							v-for="emoji in easterEggEmojis"
							:key="emoji.id"
							class="emoji"
							:data-physics-x="emoji.left"
							:data-physics-y="emoji.top"
							:class="{
								_physics_circle_: !emoji.emoji.startsWith(':'),
							}"
							><MkEmoji
								class="emoji"
								:emoji="emoji.emoji"
								:custom-emojis="$instance.emojis"
								:is-reaction="false"
								:normal="true"
								:no-style="true"
						/></span>
					</div>
					<div class="_formBlock" style="text-align: center">
						{{ i18n.ts._aboutFirefish.about }}<br /><a
							href="https://rosekey.sbs"
							target="_blank"
							class="_link"
							>{{ i18n.ts.learnMore }}</a
						>
					</div>
					<div class="_formBlock" style="text-align: center">
						<MkButton primary rounded inline @click="iLoveMisskey"
							>I <Mfm text="$[jelly ❤]" /> #Rosekey</MkButton
						>
					</div>
					<FormSection>
						<div class="_formLinks">
							<FormLink
								to="https://github.com/freelynetwork/rosekey"
								external
							>
								<template #icon
									><i :class="icon('ph-code')"></i
								></template>
								{{ i18n.ts._aboutFirefish.source }}
								<template #suffix>GitHub</template>
							</FormLink>
						</div>
					</FormSection>
					<FormSection>
						<template #label>{{
							i18n.ts._aboutFirefish.contributors
						}}</template>
						<div class="_formLinks">
							<FormLink to="/@164@roseskey.sbs"
								><Mfm
									:text="'$[sparkle @164@roseskey.sbs] (Main developer)'"
							/></FormLink>
						</div>
						<h3
							style="
								font-weight: 700;
								margin: 1.5em 0 16px;
								font-size: 1em;
							"
						>
							{{ i18n.ts._aboutFirefish.misskeyContributors }}
						</h3>
						<div class="_formLinks">
							<FormLink to="/@kainoa@firefish.social"
								><Mfm
									:text="'$[sparkle @kainoa@firefish.social] (Main developer)'"
							/></FormLink>
							<FormLink to="/@freeplay@firefish.social"
								><Mfm
									:text="'@freeplay@firefish.social (UI/UX)'"
							/></FormLink>
							<FormLink to="/@namekuji@firefish.social"
								><Mfm
									:text="'@namekuji@firefish.social (Backend)'"
							/></FormLink>
							<FormLink to="/@dev@post.naskya.net"
								><Mfm
									:text="'@dev@post.naskya.net (Fullstack)'"
							/></FormLink>
							<FormLink to="/@panos@firefish.social"
								><Mfm
									:text="'@panos@firefish.social (Project coordinator)'"
							/></FormLink>
							<FormLink to="/@blackspike@mastodon.cloud"
								><Mfm
									:text="'@blackspike@mastodon.cloud (Logo design)'"
							/></FormLink>
							<FormLink to="/@magi@minazukey.uk"
								><Mfm
									:text="'@magi@minazukey.uk (Error images)'"
							/></FormLink>
							<FormLink to="/@syuilo@misskey.io"
								><Mfm :text="'@syuilo@misskey.io'"
							/></FormLink>
							<FormLink to="/@aqz@p1.a9z.dev"
								><Mfm :text="'@aqz@p1.a9z.dev'"
							/></FormLink>
							<FormLink to="/@ac@misskey.cloud"
								><Mfm :text="'@ac@misskey.cloud'"
							/></FormLink>
							<FormLink to="/@rinsuki@mstdn.rinsuki.net"
								><Mfm :text="'@rinsuki@mstdn.rinsuki.net'"
							/></FormLink>
							<FormLink to="/@mei23@misskey.m544.net"
								><Mfm :text="'@mei23@misskey.m544.net'"
							/></FormLink>
							<FormLink to="/@robflop@misskey.io"
								><Mfm :text="'@robflop@misskey.io'"
							/></FormLink>
						</div>
						<h3>
							<MkLink
								url="https://github.com/freelynetwork/rosekey/graphs/contributors"
								>{{ i18n.ts._aboutFirefish.allContributors }}
							</MkLink>
						</h3>
					</FormSection>
				</div>
			</MkSpacer>
		</div>
	</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { version } from "@/config";
import FormLink from "@/components/form/link.vue";
import FormSection from "@/components/form/section.vue";
import MkButton from "@/components/MkButton.vue";
import MkLink from "@/components/MkLink.vue";
import { physics } from "@/scripts/physics";
import { i18n } from "@/i18n";
import { defaultStore } from "@/store";
import * as os from "@/os";
import { definePageMetadata } from "@/scripts/page-metadata";
import icon from "@/scripts/icon";

let patrons = [],
	sponsors = [];
const patronsResp = await os.api("patrons", { forceUpdate: true });
patrons = patronsResp.patrons;
sponsors = patronsResp.sponsors;

patrons = patrons.filter((patron) => !sponsors.includes(patron));

let easterEggReady = false;
const easterEggEmojis = ref([]);
const easterEggEngine = ref(null);
const containerEl = ref<HTMLElement>();

function iconLoaded() {
	const emojis = defaultStore.state.reactions;
	const containerWidth = containerEl.value?.offsetWidth;
	for (let i = 0; i < 32; i++) {
		easterEggEmojis.value.push({
			id: i.toString(),
			top: -(128 + Math.random() * 256),
			left: Math.random() * containerWidth,
			emoji: emojis[Math.floor(Math.random() * emojis.length)],
		});
	}

	nextTick(() => {
		easterEggReady = true;
	});
}

function gravity() {
	if (!easterEggReady) return;
	easterEggReady = false;
	easterEggEngine.value = physics(containerEl.value);
}

function iLoveMisskey() {
	os.post({
		initialText: "I $[jelly ❤] #Rosekey",
		instant: true,
	});
}

onBeforeUnmount(() => {
	if (easterEggEngine.value) {
		easterEggEngine.value.stop();
	}
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts.aboutFirefish,
	icon: null,
});
</script>

<style lang="scss" scoped>
.znqjceqz {
	> .about {
		position: relative;
		text-align: center;
		padding: 16px;
		border-radius: var(--radius);

		&.playing {
			&,
			* {
				user-select: none;
			}

			* {
				will-change: transform;
			}

			> .emoji {
				visibility: visible;
			}
		}

		> .icon {
			display: block;
			width: 100px;
			margin: 0 auto;
			border-radius: 3px;
		}

		> .misskey {
			margin: 0.75em auto 0 auto;
			width: max-content;
		}

		> .version {
			margin: 0 auto;
			width: max-content;
			opacity: 0.5;
		}

		> .emoji {
			position: absolute;
			top: 0;
			left: 0;
			visibility: hidden;

			> .emoji {
				pointer-events: none;
				font-size: 24px;
				width: 24px;
			}
		}
	}
}
</style>
