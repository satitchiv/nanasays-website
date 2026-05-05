'use client'

export type ChildOption = { id: string; name: string }

type Props = {
  childOptions: ChildOption[]
  activeChildId: string | null
  onChange?: (id: string) => void
}

// Top-bar dropdown for switching the active child. Hidden when the parent has
// 0 or 1 children — multi-child support is the slice 3 feature; this affordance
// is built in slice 1 so the slot exists when slice 3 wires real data.
export default function ChildSelector({ childOptions, activeChildId, onChange }: Props) {
  if (childOptions.length <= 1) return null

  return (
    <label className="rr-child-selector">
      <span className="rr-child-selector-label">Child</span>
      <select
        className="rr-child-selector-input"
        value={activeChildId ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {childOptions.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  )
}
