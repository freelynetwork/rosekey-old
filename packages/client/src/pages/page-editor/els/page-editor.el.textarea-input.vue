<template>
	<XContainer :draggable="true" @remove="() => $emit('remove')">
		<template #header
			><i :class="icon('ph-lightning')"></i>
			{{ i18n.ts._pages.blocks.textareaInput }}</template
		>

		<section style="padding: 0 16px 16px 16px">
			<MkInput v-model="value.name"
				><template #prefix
					><i :class="icon('ph-magic-wand')"></i></template
				><template #label>{{
					i18n.ts._pages.blocks._textareaInput.name
				}}</template></MkInput
			>
			<MkInput v-model="value.text"
				><template #label>{{
					i18n.ts._pages.blocks._textareaInput.text
				}}</template></MkInput
			>
			<MkTextarea v-model="value.default"
				><template #label>{{
					i18n.ts._pages.blocks._textareaInput.default
				}}</template></MkTextarea
			>
		</section>
	</XContainer>
</template>

<script lang="ts" setup>
import XContainer from "../page-editor.container.vue";
import MkTextarea from "@/components/form/textarea.vue";
import MkInput from "@/components/form/input.vue";
import { i18n } from "@/i18n";
import icon from "@/scripts/icon";

withDefaults(
	defineProps<{
		value: any;
	}>(),
	{
		value: {
			name: "",
		},
	},
);
</script>
