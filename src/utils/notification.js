import { ElNotification, ElMessageBox } from 'element-plus';

/**
 * 通知工具
 *
 * 所有通知统一通过此模块发送，方便后续接入操作历史。
 *
 * 设计要点：
 * - error 类型不自动消失（duration: 0），必须用户主动关闭 X
 *   理由：错误信息用户切走再回来仍能看到，避免错过
 * - success / warning / info 仍保留自动消失
 * - position 统一使用 top-right，多个通知自上而下垂直堆叠
 *
 * 用法：
 *   import notification from '@/utils/notification';
 *   notification.success('操作成功');
 *   notification.error('操作失败');
 *   notification.warning('存储空间不足');
 *   notification.info('有新版本可用');
 *   notification.confirm('确定要删除？', '警告').then(() => { ... });
 */

// 统一位置：右上角，新通知自上而下堆叠
const POSITION = 'top-right';

const notification = {
    success(message, title) {
        ElNotification({
            type: 'success',
            title: title || 'Success',
            message,
            position: POSITION,
            duration: 3000
        });
    },

    // 错误通知：不自动消失，必须用户主动关闭
    // 避免用户切走后错过错误原因
    error(message, title) {
        ElNotification({
            type: 'error',
            title: title || 'Error',
            message,
            position: POSITION,
            duration: 0,
            showClose: true
        });
    },

    warning(message, title) {
        ElNotification({
            type: 'warning',
            title: title || 'Warning',
            message,
            position: POSITION,
            duration: 4000
        });
    },

    info(message, title) {
        ElNotification({
            type: 'info',
            title: title || 'Info',
            message,
            position: POSITION,
            duration: 3000
        });
    },

    confirm(message, title, options) {
        return ElMessageBox.confirm(message, title || 'Confirm', {
            confirmButtonText: 'OK',
            cancelButtonText: 'Cancel',
            type: (options && options.type) || 'warning',
            ...options
        });
    }
};

export default notification;
