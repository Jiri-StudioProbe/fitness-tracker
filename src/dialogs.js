// window.confirm()/alert() are silently no-ops in an iOS home-screen PWA
// (display: standalone in the manifest) — WebKit never shows the native
// dialog there, so confirm() just returns false immediately. These are
// in-app replacements that actually work when installed, shared by any
// view that needs a confirm/notice (Plan Builder, the Day sheet, ...).

function el(tag, attrs) {
  const node = document.createElement(tag)
  if (attrs) for (const k in attrs) {
    if (k === 'class') node.className = attrs[k]
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k])
    else node.setAttribute(k, attrs[k])
  }
  return node
}

function dialogOverlay(messageText, buttons) {
  const overlay = el('div', { class: 'pb-confirm-overlay' })
  const box = el('div', { class: 'pb-confirm-box' })
  const msg = el('p', { class: 'pb-confirm-message' })
  msg.textContent = messageText
  box.appendChild(msg)
  const actions = el('div', { class: 'pb-confirm-actions' })
  buttons.forEach(({ label, primary, onClick }) => {
    const btn = el('button', { class: 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'), type: 'button' })
    btn.textContent = label
    btn.addEventListener('click', () => { overlay.remove(); onClick?.() })
    actions.appendChild(btn)
  })
  box.appendChild(actions)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

export function showConfirm(messageText, confirmLabel, onConfirm) {
  dialogOverlay(messageText, [
    { label: 'Cancel' },
    { label: confirmLabel, primary: true, onClick: onConfirm },
  ])
}

export function showNotice(messageText) {
  dialogOverlay(messageText, [{ label: 'OK', primary: true }])
}
