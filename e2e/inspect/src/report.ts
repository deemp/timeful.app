import type { CompareTarget } from "./scenarios/index.js"
import type { Snapshot, SnapshotElement } from "./types.js"

function printSnapshotElement(elementName: string, element: SnapshotElement | null) {
  if (element == null) {
    console.log(`\n[${elementName}] missing`)
    return
  }

  console.log(`\n[${elementName}] found`)
  console.log(
    JSON.stringify(
      {
        tagName: element.tagName,
        className: element.className,
        text: element.text,
        box: element.box,
        properties: element.properties,
      },
      null,
      2,
    ),
  )
}

export function printSnapshot(target: CompareTarget, snapshot: Snapshot) {
  console.log(`target=${target}`)

  for (const [elementName, element] of Object.entries(snapshot)) {
    printSnapshotElement(elementName, element)
  }
}
