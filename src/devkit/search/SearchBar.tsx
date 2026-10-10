// The Dev Kit's search box: pinned under the tabs row, searches the OPEN tab live as you type ("Search Tuning…").
// DevKit.tsx hands the text to that tab as its `query`; the tab filters itself. ✕ or Esc clears it.
type Props = {
  value: string
  onChange: (value: string) => void
  label: string // the open tab's name
}

export function SearchBar({ value, onChange, label }: Props) {
  return (
    <div className="dk-search" role="search">
      <div className="dk-search-box">
        <span className="dk-search-icon" aria-hidden="true">⌕</span>
        <input
          className="dk-search-input"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Search ${label}…`}
          aria-label={`Search ${label}`}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {value && (
          <button type="button" className="dk-search-clear" onClick={() => onChange('')} aria-label="Clear the search" title="Clear (Esc)">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
