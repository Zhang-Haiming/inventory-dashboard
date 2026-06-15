'use client'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface EditableCellProps {
  value: string | number
  onSave: (value: string | number) => void
  type?: 'text' | 'number' | 'date'
  className?: string
  placeholder?: string
}

export function EditableCell({ value, onSave, type = 'text', className, placeholder }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // 同步外部值变化（比如 import 后整体替换）
  useEffect(() => {
    if (!editing) setDraft(String(value ?? ''))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === String(value ?? '')) return  // 没有变化
    const parsed = type === 'number' ? Number(trimmed) || 0 : trimmed
    onSave(parsed)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type === 'number' ? 'number' : type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setDraft(String(value ?? '')) }
        }}
        placeholder={placeholder}
        className={cn(
          'w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400',
          type === 'number' && 'text-right',
          className
        )}
        step={type === 'number' ? 'any' : undefined}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="点击编辑"
      className={cn(
        'block cursor-pointer rounded px-1 py-0.5 hover:bg-slate-100 transition-colors min-h-[1.5rem]',
        type === 'number' && 'text-right',
        !value && value !== 0 && 'text-slate-300',
        className
      )}
    >
      {value || value === 0 ? String(value) : placeholder ?? '—'}
    </span>
  )
}
