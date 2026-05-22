import { FullSlug } from "../../../util/path"

export async function renderUtility(slug:FullSlug) {

}

export function cleanupUtilityContainers() {

}

export function prepareUtilityContainer() {
  const controlContainer:HTMLDivElement | null = document.querySelector(".disctrict-global-graph-controls")

  const icon = document.createElement('div')
  const button = document.createElement('button')

  icon.classList.add("icon")
  button.classList.add("disctrict-expand-btn")
  button.title = "Expand View"
  button.appendChild(icon)

  button?.addEventListener("click", async () => {
    const divs = document.querySelectorAll(".disctrict-popout-wrapper")
    divs.forEach((item) => {
      item.classList.toggle("disctrict-expand")
    })
  })

  controlContainer?.appendChild( button )
}

