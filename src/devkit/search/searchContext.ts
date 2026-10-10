// What the Dev Kit panel lends a tab for its search results: goTo(sectionId) = "take me to this section" (clears the
// search, opens + scrolls to the section). The search text itself comes as the tab's `query` prop (DevKit.tsx).
// A tab reads this with useContext(DevKitSearch); DevKit.tsx provides it.
import { createContext } from 'react'

export type DevKitSearchInfo = { goTo: (sectionId: string) => void }

export const DevKitSearch = createContext<DevKitSearchInfo>({ goTo: () => {} })
