<template>
	<div>
		<XValue :value="value" :collapsed="false" />
	</div>
</template>

<script lang="ts" setup>
import XValue from "./MkObjectView.value.vue";

defineProps<{
	value: Record<string, unknown>;
}>();
</script>
