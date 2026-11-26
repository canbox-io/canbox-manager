<script setup>
/**
 * 多选筛选浮层（我的应用 / 应用仓库共用）
 *
 * 触发按钮显示当前选择概要，浮层内为多选按钮 + 三态全选 + 反选。
 * 选中值由父级 v-model 控制，默认全选时等价于不筛选。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
    label: { type: String, required: true },
    options: { type: Array, required: true }, // [{ value, label }]
    modelValue: { type: Array, required: true },
    columns: { type: Number, default: 3 },
    panelWidth: { type: Number, default: 340 }
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const open = ref(false);
const popoverRef = ref(null);
const triggerRef = ref(null);
const selectedSet = computed(() => new Set(props.modelValue));
const allSelected = computed(() => props.options.length > 0 && props.modelValue.length === props.options.length);
const noneSelected = computed(() => props.modelValue.length === 0);
const indeterminate = computed(() => !allSelected.value && !noneSelected.value);

const summary = computed(() => {
    if (allSelected.value) return t('filter.all');
    if (noneSelected.value) return t('filter.none');
    return `${props.modelValue.length}/${props.options.length}`;
});

function emitValues(values) {
    // 按选项原始顺序输出，保证 v-model 值稳定可比
    const set = new Set(values);
    emit('update:modelValue', props.options.filter(o => set.has(o.value)).map(o => o.value));
}

function toggle(value) {
    const next = new Set(props.modelValue);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    emitValues(next);
}

function onMasterChange(checked) {
    emitValues(checked ? props.options.map(o => o.value) : []);
}

function invert() {
    emitValues(props.options.filter(o => !selectedSet.value.has(o.value)).map(o => o.value));
}

// 浮层展开时按 Esc 收起浮层：捕获阶段拦截，避免 Element Plus 的 focus-trap
// 把焦点交还给触发按钮（视觉上像是"选中"了按钮）
function onEscapeKeydown(e) {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    popoverRef.value?.hide();
    const active = document.activeElement;
    if (active && (active === triggerRef.value || active.closest?.('.filter-panel'))) {
        active.blur?.();
    }
}

watch(open, (val) => {
    if (val) document.addEventListener('keydown', onEscapeKeydown, true);
    else document.removeEventListener('keydown', onEscapeKeydown, true);
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onEscapeKeydown, true);
});
</script>

<template>
    <el-popover
        ref="popoverRef"
        placement="bottom-start"
        :width="panelWidth"
        trigger="click"
        popper-class="filter-menu-popper"
        @show="open = true"
        @hide="open = false"
    >
        <template #reference>
            <button ref="triggerRef" type="button" class="filter-trigger" :class="{ active: !allSelected }">
                <span>{{ label }}</span>
                <span class="filter-summary">{{ summary }}</span>
                <span class="filter-caret" :class="{ open }">▼</span>
            </button>
        </template>

        <div class="filter-panel">
            <div class="filter-panel-head">
                <el-checkbox
                    :model-value="allSelected"
                    :indeterminate="indeterminate"
                    @change="onMasterChange"
                >
                    {{ $t('filter.selectAll') }}
                </el-checkbox>
                <button type="button" class="filter-link" @click="invert">
                    {{ $t('filter.invert') }}
                </button>
            </div>
            <div
                class="filter-options"
                :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
            >
                <button
                    v-for="opt in options"
                    :key="opt.value"
                    type="button"
                    class="filter-option"
                    :class="{ active: selectedSet.has(opt.value) }"
                    @click="toggle(opt.value)"
                >
                    <span class="filter-option-check">✓</span>
                    <span class="filter-option-label">{{ opt.label }}</span>
                </button>
            </div>
        </div>
    </el-popover>
</template>

<style scoped>
.filter-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border: 1px solid var(--el-border-color);
    background: var(--el-bg-color);
    border-radius: 16px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    transition: all 0.2s;
}
.filter-trigger:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
}
.filter-trigger.active {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
}
.filter-summary {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
.filter-trigger.active .filter-summary {
    color: var(--el-color-primary);
}
.filter-caret {
    font-size: 9px;
    line-height: 1;
    transition: transform 0.2s;
}
.filter-caret.open {
    transform: rotate(180deg);
}

.filter-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}
.filter-link {
    border: none;
    background: none;
    padding: 0;
    font-size: 12px;
    color: var(--el-color-primary);
    cursor: pointer;
}
.filter-link:hover {
    text-decoration: underline;
}
.filter-options {
    display: grid;
    gap: 8px;
    max-height: 260px;
    overflow-y: auto;
    padding: 2px;
}
.filter-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
    text-align: center;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.filter-option:hover {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
}
.filter-option.active {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    font-weight: 500;
}
.filter-option-check {
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0;
    transition: opacity 0.2s;
}
.filter-option.active .filter-option-check {
    opacity: 1;
}
.filter-option-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>

<!-- el-popover 会 teleport 到 body，需用非 scoped + 专属类名调整浮层外观 -->
<style>
.filter-menu-popper.el-popover {
    padding: 12px 14px;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
</style>
