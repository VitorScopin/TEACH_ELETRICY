import { trafficLightProject } from './trafficLight'

export const projectCatalog = [
  trafficLightProject,
] as const

export type ProjectId = (typeof projectCatalog)[number]['id']

export function getProject(projectId: ProjectId) {
  return projectCatalog.find((project) => project.id === projectId)
}
