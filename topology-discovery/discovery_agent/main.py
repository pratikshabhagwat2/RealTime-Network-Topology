from builder import collect_topology, connect_device, save_topology_json

import logging
import time, os

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "60"))


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def main():
    while True:
        logging.info("[*] Collecting and writing topology...")
        topology = collect_topology()
        save_topology_json(topology)
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
