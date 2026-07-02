import { ElNotification, ElMessageBox } from 'element-plus';

/**
 * 通知工具
 *
 * 所有通知统一通过此模块发送，方便后续接入操作历史。
 *
 * 用法：
 *   import notification from '@/utils/notification';
 *   notification.success('操作成功');
 *   notification.error('操作失败');
 *   notification.warning('存储空间不足');
 *   notification.info('有新版本可用');
 *   notification.confirm('确定要删除？', '警告').then(() => { ... });
 */

const notification = {
    success(message, title) {
        ElNotification({
            type: 'success',
            title: title || 'Success',
            message,
            position: 'top-right',
            duration: 3000
        });
    },

    error(message, title) {
        ElNotification({
            type: 'error',
            title: title || 'Error',
            message,
            position: 'top-right',
            duration: 5000
        });
    },

    warning(message, title) {
        ElNotification({
            type: 'warning',
            title: title || 'Warning',
            message,
            position: 'top-right',
            duration: 4000
        });
    },

    info(message, title) {
        ElNotification({
            type: 'info',
            title: title || 'Info',
            message,
            position: 'top-right',
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
