// A drag-to-scrub number wheel: drag vertically over the number to spin
// through values (release to commit), instead of typing into a text
// field. Distance from the exact snap point drives both the row's scale
// and its opacity continuously — nothing about a row's size or visibility
// changes in a discrete jump when its role (peek vs. selected) flips —
// with a small overshoot past resting size as a value sweeps through
// dead center mid-drag, Dock-magnification style, that eases back down
// to normal the instant the drag ends.
//
// Row spacing IS the drag distance per step (both ROW_H) so the number
// tracks the finger 1:1 with no rate mismatch.

const ROW_H = 52
const PEEK_SCALE = 0.4
const DRAG_PEAK_SCALE = 1.18
const PEEK_OPACITY_DRAGGING = 0.32

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
// Zero slope at both ends — the swing eases in, does most of its
// movement through the middle of the gesture, then eases out — so it
// reads as a magnify swoop rather than a linear fade.
function smoothstep(t) { return t * t * (3 - 2 * t) }

// Mounts a wheel into `container`, replacing its content. Call this
// fresh on every render (same model as the rest of this app — there's
// no persistent-component update path) rather than trying to patch an
// existing mount; a drag in progress survives because nothing here
// calls back into the app's own render() until the value actually
// commits on release.
export function mountWheelPicker(container, { min, max, value, onChange }) {
  container.innerHTML = ''
  container.classList.add('flow-wheel-mask')

  const state = { value, center: null, liveV: value, dragging: false }

  function renderRows(center) {
    container.innerHTML = ''
    for (let i = -1; i <= 1; i++) {
      const v = center + i
      const row = document.createElement('div')
      row.className = 'flow-wheel-row'
      row.dataset.i = i
      row.style.top = `calc(50% + ${i * ROW_H}px - ${ROW_H / 2}px)`
      row.textContent = (v >= min && v <= max) ? v : ''
      container.appendChild(row)
    }
    state.center = center
  }

  function update(v) {
    v = clamp(v, min, max)
    const center = Math.round(v)
    if (state.center !== center) renderRows(center)
    const frac = v - center
    const peekFloor = state.dragging ? PEEK_OPACITY_DRAGGING : 0
    const peakScale = state.dragging ? DRAG_PEAK_SCALE : 1
    container.querySelectorAll('.flow-wheel-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10)
      const dist = Math.min(Math.abs(i - frac), 1) // 0 = exactly selected, 1 = a full row away
      const eased = smoothstep(1 - dist)
      const scale = lerp(PEEK_SCALE, peakScale, eased)
      const opacity = lerp(peekFloor, 1, eased)
      row.style.transform = `translateY(${-frac * ROW_H}px) scale(${scale.toFixed(3)})`
      row.style.opacity = opacity.toFixed(3)
    })
    state.liveV = v
  }

  renderRows(Math.round(value))
  update(value)

  let startY = 0
  let startV = value
  let activePointerId = null

  function onMove(e) {
    const dy = startY - e.clientY // up = positive
    update(startV + dy / ROW_H)
  }

  function settle() {
    const finalV = Math.round(state.liveV)
    const changed = finalV !== state.value
    state.value = finalV
    // Ease the leftover fractional/scale/opacity offset back to rest on
    // the SAME row elements already on screen (update() keeps `center`
    // in sync throughout the drag, so they already show the right
    // numbers) — rebuilding them here would replace them the instant
    // the transition was set, and the ease-out would never play.
    container.querySelectorAll('.flow-wheel-row').forEach(row => {
      row.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s cubic-bezier(.2,.8,.2,1)'
    })
    update(finalV)
    setTimeout(() => {
      container.querySelectorAll('.flow-wheel-row').forEach(row => { row.style.transition = 'opacity .18s ease' })
    }, 240)
    if (changed) onChange(finalV)
  }

  function onUp() {
    state.dragging = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    settle()
    // Release is best-effort cleanup — do it last, and never let a
    // failure here (e.g. an id the browser never actually captured)
    // swallow the settle/listener-cleanup above.
    try { if (activePointerId !== null) container.releasePointerCapture?.(activePointerId) } catch { /* ignore */ }
  }

  container.addEventListener('pointerdown', e => {
    state.dragging = true
    update(state.value) // reveal the neighbour rows right away, even before any movement
    activePointerId = e.pointerId
    // Best-effort — a failure here must not stop the drag from being
    // wired up below.
    try { container.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
    startY = e.clientY
    startV = state.value
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })

  return state
}
