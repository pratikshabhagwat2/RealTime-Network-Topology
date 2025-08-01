export async function fetchTopology() {
  const response = await fetch('/static/topology.json?_t=' + Date.now());
  return await response.json();
}

