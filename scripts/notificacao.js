const Notificacao = {
  show(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const icons = {
      success: 'ph ph-check-circle',
      error: 'ph ph-x-circle',
      warning: 'ph ph-warning',
      info: 'ph ph-info'
    };

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <i class="${icons[type] || icons.info}"></i>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideIn 0.4s ease reverse';
      setTimeout(() => notification.remove(), 400);
    }, 4000);
  },

  showProgress(percentage, current, total) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-bar-fill');
    const percentText = document.getElementById('progress-percentage');
    const filesText = document.getElementById('progress-files');

    container.classList.add('show');
    fill.style.width = `${percentage}%`;
    percentText.textContent = `${Math.round(percentage)}%`;
    filesText.textContent = `Arquivo ${current} de ${total}`;

    if (percentage >= 100) {
      setTimeout(() => {
        container.classList.remove('show');
      }, 2000);
    }
  },

  hideProgress() {
    document.getElementById('progress-container').classList.remove('show');
  }
};