<template>
	<XColumn
		:column="column"
		:is-stacked="isStacked"
		@parent-focus="($event) => emit('parent-focus', $event)"
	>
		<template #header
			><i
				:class="icon('ph-envelope-simple-open')"
				style="margin-right: 8px"
			></i
			>{{ column.name }}</template
		>

		<XNotifications
			:include-types="['mention', 'reply']"
			:unread-only="false"
			:direct-only="true"
		/>
	</XColumn>
</template>

<script lang="ts" setup>
import XColumn from "./column.vue";
import XNotifications from "@/components/MkNotifications.vue";
import type { Column } from "./deck-store";
import icon from "@/scripts/icon";

defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const emit = defineEmits<{
	(ev: "parent-focus", direction: "up" | "down" | "left" | "right"): void;
}>();
</script>
