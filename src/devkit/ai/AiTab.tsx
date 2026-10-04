// AI TOOL — tune the game's AI opponents: pick a personality (or copy one into a new one), drag its trait ranges,
// reorder its goals, set its nudge / chattiness / extras, its mood shifts and its bio; pick a skill and set its
// numbers. Then watch AIs play with their thoughts showing, or run the Personality Check over many games.
//   The parts sit in sections named by the content files' own "_sections" (+ the tab's: bio, watch, check), so the
//   Dev Kit's search box finds them ("nerve", "wobble"). Readable names and help lines come from "_labels" / "_help".
//   Save writes the changed files whole (content/ai/… and the bio's text file) — their notes stay as they were.
//   Problems (a goal missing from the list, a range upside down) come from the game's validate callback; Save waits
//   until there are none.
// The game plugs it in with aiTab(…) (aiTabEntry.ts) from src/devkit-game/tabs.ts. Shapes: aiTypes.ts. Thinking: aiLogic.ts.
import { useContext, useState, type DragEvent, type ReactNode } from 'react'
import { CAN_SAVE, copyText, saveContentFile } from '../saveContent'
import { Section, SectionIndex } from '../search/Section'
import { DevKitSearch } from '../search/searchContext'
import { searchTerms } from '../search/searchLogic'
import { CheckPanel } from './CheckPanel'
import { RangeSlider } from './RangeSlider'
import { WatchPanel } from './WatchPanel'
import {
  BIO_SECTION, CHECK_SECTION, WATCH_SECTION, aiSections, copyPersonality, freeId, getAt, helpOf, labelOf, listChanges,
  listOf, moveGoal, newShift, searchAi, setAt, withList, withRange, type AiSection,
} from './aiLogic'
import type { AiFile, AiPersonality, AiShift, AiSkill, DevKitAi } from './aiTypes'
import '../tuning/tuning.css'
import './ai.css'

type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null

export function AiTab({ ai }: { ai: DevKitAi }) {
  const search = useContext(DevKitSearch)
  const [sections] = useState(() => aiSections(ai))
  const [savedPeople, setSavedPeople] = useState(() => listOf<AiPersonality>(ai.personalities))
  const [people, setPeople] = useState(savedPeople)
  const [savedSkills, setSavedSkills] = useState(() => listOf<AiSkill>(ai.skills))
  const [skills, setSkills] = useState(savedSkills)
  const [savedBios, setSavedBios] = useState(() => ai.bios?.data ?? {})
  const [bios, setBios] = useState(savedBios)
  const [pickedId, setPickedId] = useState(() => savedPeople[0]?.id ?? '')
  const [skillId, setSkillId] = useState(() => savedSkills[Math.min(1, savedSkills.length - 1)]?.id ?? '') // the middle one, if any
  const [newName, setNewName] = useState<string | null>(null) // "Copy to new" is asking for a name
  const [status, setStatus] = useState<Status>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)

  const picked = people.find((p) => p.id === pickedId) ?? people[0]
  const savedPicked = savedPeople.find((p) => p.id === picked?.id)
  const skill = skills.find((s) => s.id === skillId) ?? skills[0]
  const savedSkill = savedSkills.find((s) => s.id === skill?.id)
  if (!picked || !skill) return <p className="devkit-not-plugged">No personalities or skills in the game's AI files.</p>

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const peopleChanged = !same(people, savedPeople)
  const skillsChanged = !same(skills, savedSkills)
  const biosChanged = !same(bios, savedBios)
  const unsaved = peopleChanged || skillsChanged || biosChanged
  const problems = people.flatMap((p) => ai.validate?.(p) ?? [])
  const isChanged = (path: (p: AiPersonality) => unknown) => !savedPicked || !same(path(picked), path(savedPicked))

  const edit = (next: AiPersonality) => setPeople((list) => list.map((p) => (p.id === picked.id ? next : p)))
  const editSkill = (next: AiSkill) => setSkills((list) => list.map((s) => (s.id === skill.id ? next : s)))
  const bioPath = ai.bios?.at(picked.id) ?? []
  const bio = String(getAt(bios, bioPath) ?? '')

  function copyToNew() {
    const id = freeId(newName ?? '', people.map((p) => p.id))
    setPeople((list) => [...list, copyPersonality(picked, id)])
    if (ai.bios) setBios((b) => setAt(b, ai.bios!.at(id), bio))
    setPickedId(id)
    setNewName(null)
    setStatus({ kind: 'info', text: `${id} is a copy of ${picked.id} — not saved yet.` })
  }

  function undo() {
    setPeople(savedPeople)
    setSkills(savedSkills)
    setBios(savedBios)
    if (!savedPeople.some((p) => p.id === pickedId)) setPickedId(savedPeople[0]?.id ?? '')
  }

  async function save() {
    if (problems.length) {
      setStatus({ kind: 'error', text: 'Fix the problems listed at the top first.' })
      return
    }
    setStatus({ kind: 'info', text: 'Saving…' })
    const written: string[] = []
    try {
      if (peopleChanged) {
        await saveContentFile(ai.personalities.path, withList(ai.personalities, people))
        written.push(ai.personalities.path)
      }
      if (skillsChanged) {
        await saveContentFile(ai.skills.path, withList(ai.skills, skills))
        written.push(ai.skills.path)
      }
      if (biosChanged && ai.bios) {
        await saveContentFile(ai.bios.path, bios)
        written.push(ai.bios.path)
      }
      setSavedPeople(people)
      setSavedSkills(skills)
      setSavedBios(bios)
      setStatus({ kind: 'ok', text: `Saved ${written.join(', ')} — refresh and it stays.` })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  async function copyForClaude() {
    const lines = [
      ...listChanges(savedPeople, people).map((l) => `${ai.personalities.path} → ${l}`),
      ...listChanges(savedSkills, skills).map((l) => `${ai.skills.path} → ${l}`),
      ...people.filter((p) => ai.bios && !same(getAt(bios, ai.bios.at(p.id)), getAt(savedBios, ai.bios.at(p.id))))
        .map((p) => `${ai.bios!.path} → ${p.id} bio: "${String(getAt(bios, ai.bios!.at(p.id)) ?? '')}"`),
    ]
    const text = lines.length
      ? `AI tab changes in ${document.title}${CAN_SAVE ? (unsaved ? ' (not saved yet)' : ' (saved)') : ' (live build — please put these in the files)'}:\n${lines.map((l) => `- ${l}`).join('\n')}`
      : `No AI changes in ${document.title}.`
    if (await copyText(text)) {
      setCopyFallback(null)
      setStatus({ kind: 'ok', text: 'Copied — paste it into your chat with Claude.' })
    } else {
      setCopyFallback(text)
      setStatus({ kind: 'error', text: 'The browser blocked copying — select the text below and copy it.' })
    }
  }

  // ---- the parts, one per key in the files' _sections ----
  const traitNames = Object.keys(picked.traits)
  const readingNames = ai.readings ?? [...new Set(people.flatMap((p) => p.shifts.map((s) => s.reading)))]
  const P = ai.personalities
  const S = ai.skills

  function personalityPart(key: string) {
    switch (key) {
      case 'id':
        return <Row key={key} file={P} path="id" changed={false}><code className="ai-id">{picked.id}</code></Row>
      case 'traits':
        return traitNames.map((trait) => (
          <Row key={trait} file={P} path={`traits.${trait}`} changed={isChanged((p) => p.traits[trait])}>
            <RangeSlider
              label={trait}
              min={picked.traits[trait].min}
              max={picked.traits[trait].max}
              onChange={(min, max, moved) => edit(withRange(picked, trait, min, max, moved))}
            />
          </Row>
        ))
      case 'goals':
        return <Row key={key} file={P} path="goals" changed={isChanged((p) => p.goals)}><GoalList goals={picked.goals} onChange={(goals) => edit({ ...picked, goals })} /></Row>
      case 'nudge':
        return <NumberRow key={key} file={P} path="nudge" value={picked.nudge} saved={savedPicked?.nudge} min={0} max={1} step={0.05} onChange={(nudge) => edit({ ...picked, nudge })} />
      case 'chattiness':
        return <NumberRow key={key} file={P} path="chattiness" value={picked.chattiness} saved={savedPicked?.chattiness} min={0} max={100} step={1} onChange={(chattiness) => edit({ ...picked, chattiness })} />
      case 'shifts':
        return <Shifts key={key} shifts={picked.shifts} readings={readingNames} traits={traitNames} changed={isChanged((p) => p.shifts)} file={P} onChange={(shifts) => edit({ ...picked, shifts })} />
      case 'extras':
        return Object.entries(picked.extras ?? {}).map(([name, value]) => (
          <NumberRow key={name} file={P} path={`extras.${name}`} value={value} saved={savedPicked?.extras?.[name]} onChange={(v) => edit({ ...picked, extras: { ...picked.extras, [name]: v } })} />
        ))
      default: {
        const value = picked[key]
        return typeof value === 'number'
          ? <NumberRow key={key} file={P} path={key} value={value} saved={savedPicked?.[key] as number} onChange={(v) => edit({ ...picked, [key]: v })} />
          : <Row key={key} file={P} path={key} changed={false}><code className="ai-id">{JSON.stringify(value)}</code></Row>
      }
    }
  }

  function skillPart(key: string) {
    if (key === 'id') {
      return (
        <Row key={key} file={S} path="id" changed={false}>
          <select className="ai-select" value={skill.id} onChange={(e) => setSkillId(e.target.value)} aria-label="Skill">
            {skills.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
        </Row>
      )
    }
    if (key === 'extras') {
      return Object.entries(skill.extras ?? {}).map(([name, value]) => (
        <NumberRow key={name} file={S} path={`extras.${name}`} value={value} saved={savedSkill?.extras?.[name]} onChange={(v) => editSkill({ ...skill, extras: { ...skill.extras, [name]: v } })} />
      ))
    }
    const value = skill[key]
    if (typeof value !== 'number') return null
    const fraction = value > 0 && value <= 1 && !Number.isInteger(value) // 0–1 settings (spread, wobble…) step by 0.05
    return <NumberRow key={key} file={S} path={key} value={value} saved={savedSkill?.[key] as number} step={fraction ? 0.05 : 1} min={0} max={fraction ? 1 : undefined} onChange={(v) => editSkill({ ...skill, [key]: v })} />
  }

  function body(section: AiSection) {
    if (section.file === 'personalities') return section.keys.map(personalityPart)
    if (section.file === 'skills') return section.keys.map(skillPart)
    if (section.title === BIO_SECTION && ai.bios) {
      return (
        <Row file={P} path="bio" label="Bio (the one line players read)" changed={!same(getAt(bios, bioPath), getAt(savedBios, bioPath))}>
          <textarea className="ai-bio" value={bio} rows={2} aria-label={`${picked.id} bio`} onChange={(e) => setBios((b) => setAt(b, bioPath, e.target.value))} />
          <small className="tt-key">{ai.bios.path} · {bioPath.join('.')}</small>
        </Row>
      )
    }
    if (section.title === WATCH_SECTION && ai.watch) return <WatchPanel watch={ai.watch} picked={picked} everyone={people} skill={skill} />
    if (section.title === CHECK_SECTION && ai.runCheck) return <CheckPanel runCheck={ai.runCheck} personalities={people} skills={skills} />
    return null
  }

  const terms = searchTerms(search.query)
  const searching = terms.length > 0
  const shown: AiSection[] = searching ? searchAi(sections, search.query) : sections
  const sectionChanged = (s: AiSection) =>
    s.file === 'personalities' ? s.keys.some((k) => isChanged((p) => p[k])) : s.file === 'skills' ? s.keys.some((k) => !same(skill[k], savedSkill?.[k])) : s.title === BIO_SECTION && biosChanged

  return (
    <div className="tt ai">
      {/* Always on top: which personality and skill you're editing */}
      <div className="ai-pick">
        <label className="ai-pick-row">
          <span>Personality</span>
          <select className="ai-select" value={picked.id} onChange={(e) => setPickedId(e.target.value)} aria-label="Personality">
            {people.map((p) => <option key={p.id} value={p.id}>{p.id}{savedPeople.some((s) => s.id === p.id) ? '' : ' (new)'}</option>)}
          </select>
        </label>
        {newName === null ? (
          <button className="devkit-btn" onClick={() => setNewName(`${picked.id}2`)}>Copy to new…</button>
        ) : (
          <span className="ai-new">
            <input className="ai-text" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New personality's name" />
            <button className="devkit-btn devkit-btn-main" onClick={copyToNew}>Copy</button>
            <button className="devkit-btn" onClick={() => setNewName(null)}>Cancel</button>
          </span>
        )}
        <span className="ai-pick-skill">Skill: <b>{skill.id}</b> (in the skill section)</span>
      </div>
      {problems.length > 0 && (
        <ul className="ai-problems" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {!searching && <SectionIndex label="AI" sections={sections.map((s) => ({ id: s.id, title: s.title, count: s.items.length }))} />}

      {shown.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          title={section.title}
          count={section.items.length}
          terms={terms}
          defaultOpen={false}
          changed={sectionChanged(section)}
          onGoTo={() => search.goTo(section.id)}
        >
          {body(section)}
        </Section>
      ))}

      <footer className="devkit-footer">
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={!unsaved} onClick={save}>
            Save
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>
          Copy for Claude
        </button>
        <button className="devkit-btn" disabled={!unsaved} onClick={undo} title="Put everything back to what's saved">
          {CAN_SAVE ? 'Undo unsaved' : 'Undo changes'}
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="tt-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </div>
  )
}

// ---- small parts ----

type RowProps = { file: AiFile; path: string; label?: string; changed: boolean; children: ReactNode }

/** One setting: [● readable name · file · key], its control, its help line. */
function Row({ file, path, label, changed, children }: RowProps) {
  const help = helpOf(file, path)
  return (
    <div className="ai-row">
      <span className="tt-name">
        {changed && <span className="tt-dot" title="Changed, not saved yet" />}
        <span className="tt-label">{label ?? labelOf(file, path)}</span>
        <code className="tt-key">{file.path.split('/').pop()} · {path}</code>
      </span>
      {children}
      {help && <p className="tt-row-help">{help}</p>}
    </div>
  )
}

type NumberRowProps = { file: AiFile; path: string; value: number; saved?: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }

/** A number: a slider too when it has a known range (nudge 0–1, chattiness 0–100), else just the box. */
function NumberRow({ file, path, value, saved, min, max, step = 0.5, onChange }: NumberRowProps) {
  const ranged = min !== undefined && max !== undefined
  return (
    <Row file={file} path={path} changed={saved !== value}>
      <div className={ranged ? 'ai-number ai-number-ranged' : 'ai-number'}>
        {ranged && (
          <input className="tt-slider" type="range" min={min} max={max} step={step} value={value} aria-label={`${path} slider`} onChange={(e) => onChange(Number(e.target.value))} />
        )}
        <input
          className="ai-num"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={path}
          onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber) }}
        />
      </div>
    </Row>
  )
}

/** The goal order: drag a goal to a new place (mouse), or ▲ ▼ (touch, keyboard). First = tried first. */
function GoalList({ goals, onChange }: { goals: string[]; onChange: (goals: string[]) => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const drop = (to: number) => (e: DragEvent) => {
    e.preventDefault()
    if (dragging !== null) onChange(moveGoal(goals, dragging, to))
    setDragging(null)
  }
  return (
    <ol className="ai-goals" aria-label="Goal order">
      {goals.map((goal, i) => (
        <li
          key={goal}
          className={dragging === i ? 'ai-goal is-dragging' : 'ai-goal'}
          draggable
          onDragStart={() => setDragging(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop(i)}
          onDragEnd={() => setDragging(null)}
        >
          <span className="ai-grip" aria-hidden="true">⠿</span>
          <span className="ai-goal-name">{i + 1}. {goal}</span>
          <button className="tt-reset" disabled={i === 0} onClick={() => onChange(moveGoal(goals, i, i - 1))} aria-label={`Move ${goal} up`}>▲</button>
          <button className="tt-reset" disabled={i === goals.length - 1} onClick={() => onChange(moveGoal(goals, i, i + 1))} aria-label={`Move ${goal} down`}>▼</button>
        </li>
      ))}
    </ol>
  )
}

type ShiftsProps = { shifts: AiShift[]; readings: string[]; traits: string[]; changed: boolean; file: AiFile; onChange: (s: AiShift[]) => void }

/** The mood shifts: one row each — when [reading] goes [from] → [full], [trait] moves by [by]. ✕ removes, + adds. */
function Shifts({ shifts, readings, traits, changed, file, onChange }: ShiftsProps) {
  const set = (i: number, part: Partial<AiShift>) => onChange(shifts.map((s, j) => (j === i ? { ...s, ...part } : s)))
  const choices = (list: string[], current: string) => (list.includes(current) ? list : [current, ...list])
  return (
    <Row file={file} path="shifts" changed={changed}>
      <div className="ai-shifts">
        {shifts.map((s, i) => (
          <div key={i} className="ai-shift">
            <span className="ai-shift-when">when</span>
            <select className="ai-select" value={s.reading} onChange={(e) => set(i, { reading: e.target.value })} aria-label={`Shift ${i + 1} reading`}>
              {choices(readings, s.reading).map((r) => <option key={r}>{r}</option>)}
            </select>
            <span>goes</span>
            <input className="ai-num" type="number" value={s.from} onChange={(e) => set(i, { from: e.target.valueAsNumber || 0 })} aria-label={`Shift ${i + 1} from`} />
            <span>→</span>
            <input className="ai-num" type="number" value={s.full} onChange={(e) => set(i, { full: e.target.valueAsNumber || 0 })} aria-label={`Shift ${i + 1} full`} />
            <select className="ai-select" value={s.trait} onChange={(e) => set(i, { trait: e.target.value })} aria-label={`Shift ${i + 1} trait`}>
              {choices(traits, s.trait).map((t) => <option key={t}>{t}</option>)}
            </select>
            <span>by</span>
            <input className="ai-num" type="number" value={s.by} onChange={(e) => set(i, { by: e.target.valueAsNumber || 0 })} aria-label={`Shift ${i + 1} by`} />
            <button className="tt-reset" onClick={() => onChange(shifts.filter((_, j) => j !== i))} aria-label={`Remove shift ${i + 1}`}>✕</button>
          </div>
        ))}
        <button className="devkit-btn" onClick={() => onChange([...shifts, newShift(readings, traits)])}>+ Add shift</button>
      </div>
    </Row>
  )
}
