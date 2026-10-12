// ONE CSV LINE → ITS FIELDS — shared by the online server (party/submittedWords.ts reads the bundled submitted.csv) and
// the Dev Kit Words tab (vite-plugins/words/wordLists.ts reads + writes it), so both read a quoted note the same way.
// A field with a comma or a quote is written "like this" with "" for a quote inside (Python's csv module does the same).

export function csvFields(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { fields.push(field); field = '' }
    else field += c
  }
  fields.push(field)
  return fields
}
