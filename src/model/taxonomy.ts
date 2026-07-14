export type AnimalContext = {
  group: string
  behavior: string
}

const groups: Record<string, AnimalContext> = {
  bird: { group: 'Bird', behavior: 'Flapping / flying' },
  insect: { group: 'Insect', behavior: 'Crawling / buzzing' },
  fish: { group: 'Fish', behavior: 'Swimming' },
  mammal: { group: 'Mammal', behavior: 'Walking / running' },
  reptile: { group: 'Reptile', behavior: 'Slithering / crawling' },
  amphibian: { group: 'Amphibian', behavior: 'Hopping / swimming' },
  mollusk: { group: 'Mollusk', behavior: 'Gliding / drifting' },
  crustacean: { group: 'Crustacean', behavior: 'Scuttling' },
}

const labelGroups: Record<string, keyof typeof groups> = {
  bat: 'bird', bird: 'bird', duck: 'bird', flamingo: 'bird', owl: 'bird', parrot: 'bird', penguin: 'bird', swan: 'bird',
  ant: 'insect', bee: 'insect', butterfly: 'insect', mosquito: 'insect', scorpion: 'insect', spider: 'insect',
  dolphin: 'fish', fish: 'fish', shark: 'fish', whale: 'fish',
  bear: 'mammal', camel: 'mammal', cat: 'mammal', cow: 'mammal', dog: 'mammal', elephant: 'mammal', giraffe: 'mammal', hedgehog: 'mammal', horse: 'mammal', kangaroo: 'mammal', lion: 'mammal', monkey: 'mammal', mouse: 'mammal', panda: 'mammal', pig: 'mammal', rabbit: 'mammal', raccoon: 'mammal', rhinoceros: 'mammal', sheep: 'mammal', squirrel: 'mammal', tiger: 'mammal', zebra: 'mammal',
  crocodile: 'reptile', 'sea turtle': 'reptile', snake: 'reptile',
  frog: 'amphibian', octopus: 'mollusk', snail: 'mollusk', crab: 'crustacean', lobster: 'crustacean',
}

export const supportedAnimalLabels = Object.keys(labelGroups).sort()

export function labelsForGroup(group: string): string[] {
  return supportedAnimalLabels.filter((label) => labelGroups[label] === group)
}

export const animalGroups = Object.entries(groups).map(([id, context]) => ({
  id,
  name: context.group,
}))

export function animalContext(label: string): AnimalContext | null {
  const group = labelGroups[label]
  return group ? groups[group] : null
}

export function displayLabel(label: string): string {
  return label.replace(/\b\w/g, (character) => character.toUpperCase())
}
