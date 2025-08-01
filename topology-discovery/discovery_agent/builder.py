import json
import re
from netmiko import ConnectHandler, NetmikoTimeoutException, NetmikoAuthenticationException
import os
import logging
from parser import parse_prompt, parse_peers, parse_bgp, parse_radius_test_output, parse_role_status


OUTPUT_PATH = os.getenv("TOPOLOGY_JSON_PATH", "./static/topology.json")
DEVICE_LIST = [
    {
        "device_type": "terminal_server",
        "host": "10.105.254.161",
        "username": "admin",
        "password": "Cisco@123",
        "port": 2024,
        "global_delay_factor": 2,
        "banner_timeout": 30,
    },
    {
        "device_type": "terminal_server",
        "host": "10.105.254.162",
        "username": "admin",
        "password": "Cisco@123",
        "port": 2024,
        "global_delay_factor": 2,
        "banner_timeout": 30,
    },
]

def connect_device(device):
    try:
        conn = ConnectHandler(**device)
        logging.info(f"[+] Connected to {device['host']}")
        return conn
    except (NetmikoTimeoutException, NetmikoAuthenticationException) as e:
        logging.error(f"[!] Failed to connect: {device['host']} - {e}")
        return None


def collect_topology():
    nodes = {}
    edges = []
    device_roles = {}
    device_hostnames = {}  # Track device IP to hostname mapping

    for device in DEVICE_LIST:
        conn = connect_device(device)
        if not conn:
            continue
        try:
            hostname = parse_prompt(conn.find_prompt())
            
            # Store the mapping of device IP to hostname
            device_hostnames[device["host"]] = hostname
            
            show_peers = conn.send_command("show peers all", expect_string=r"#")
            show_bgp = conn.send_command("show bgp-neighbors", expect_string=r"#")
            test_radius_auth = conn.send_command("test-radius authentication all", expect_string=r"#")
            test_radius_acc = conn.send_command("test-radius accounting all", expect_string=r"#")

            # Get role information for instances 1 and 2
            show_role_1 = conn.send_command("show role instance-id 1", expect_string=r"#")
            show_role_2 = conn.send_command("show role instance-id 2", expect_string=r"#")

            # Parse role information
            role_1 = parse_role_status(show_role_1)
            role_2 = parse_role_status(show_role_2)

            device_roles[hostname] = {}
            if role_1:
                device_roles[hostname]["instance_1"] = role_1
            if role_2:
                device_roles[hostname]["instance_2"] = role_2

            nodes[hostname] = { "id": hostname, "label": hostname, "type": "cp" }
            upf_sub_count = conn.send_command("show subscriber session count", expect_string=r"#")
            match = re.search(r'"sessionCount":\s*(\d+)', upf_sub_count)
            nodes[hostname] = { "id": hostname, "label": hostname, "type": "cp", "metadata": {"upf_sub_count": int(match.group(1)) if match else 0} }
                
            peers = parse_peers(show_peers)
            for peer in peers:
                logging.info(type(peers))
                logging.info(f"peer: {peer}")
                upf_sub_count = None  # Initialize variable to store UPF subscriber count
                logging.info(f'peer_type: {peer["type"]}')
                
                # If the peer type is "router", fetch the UPF subscriber count
                if peer["type"] == "router":
                    upf = peer["target"]
                    command = f"show subscriber session filter {{ upf {upf} }} count"
                    logging.info(f"command: {command}")
                    upf_sub_count = conn.send_command(command, expect_string=r"#")
                    match = re.search(r'"sessionCount":\s*(\d+)', upf_sub_count)
                    upf_sub_count = int(match.group(1)) if match else 0
                    logging.info(f"upf_sub_count: {upf_sub_count}")

                # Add the peer to nodes
                peer["source"] = hostname
                if peer["target"] not in nodes:
                    nodes[peer["target"]] = {
                        "id": peer["target"],
                        "label": peer["target"],
                        "type": peer["type"],
                        "metadata": {**peer.get("metadata", {}), "upf_sub_count": upf_sub_count, "CPU" : "60%", "Memory" : "49%", "Location" : "BGL LAB 01"},  # Add upf_sub_count to metadata
                    }
                    logging.info(f"Node Metadata: {nodes[peer['target']]['metadata']}")

                # Add the peer to edges
                edges.append({
                    "id": f"{hostname}-{peer['target']}",
                    "source": hostname,
                    "target": peer["target"],
                    "label": peer["protocol"],
                    "state": peer["state"],
                    "metadata": {**peer.get("metadata", {})},  # Add upf_sub_count to metadata
                })
                logging.info(f"Edge Metadata: {edges[-1]['metadata']}")
            logging.info(f"edges: {edges}")
            logging.info(f"nodes: {nodes}")
            conn.disconnect()

            bgps = parse_bgp(show_bgp)
            for bgp in bgps:
                if bgp["peer"] not in nodes:
                    nodes[bgp["peer"]] = {
                        "id": bgp["peer"],
                        "label": bgp["peer"],
                        "type": "site"
                    }
                edges.append({
                    "id": f"{hostname}-{bgp['peer']}-bgp",
                    "source": hostname,
                    "target": bgp["peer"],
                    "label": "BGP",
                    "state": bgp["state"]
                })

            radius_auth_info = parse_radius_test_output(test_radius_auth)
            for radius_auth in radius_auth_info:
                radius_auth["source"] = hostname
                if radius_auth["target"] not in nodes:
                    nodes[radius_auth["target"]] = {
                        "id": radius_auth["target"],
                        "label": radius_auth["target"].upper(),
                        "type": radius_auth["type"],
                        "metadata": radius_auth.get("metadata", {})  # Add metadata if present
                    }
                edges.append({
                    "id": f"{hostname}-{radius_auth['target']}",
                    "source": hostname,
                    "target": radius_auth["target"],
                    "label": radius_auth["protocol"].upper(),
                    "state": radius_auth["state"],
                    "metadata": radius_auth.get("metadata", {})  # Add metadata to edge if present
                })
            # Updated for RADIUS Accounting
            radius_acc_info = parse_radius_test_output(test_radius_acc)  # Reusing the same parser
            for radius_acc in radius_acc_info:
                radius_acc["source"] = hostname
                if radius_acc["target"] not in nodes:
                    nodes[radius_acc["target"]] = {
                        "id": radius_acc["target"],
                        "label": radius_acc["target"].upper(),
                        "type": radius_acc["type"],
                        "metadata": radius_acc.get("metadata", {})  # Add metadata if present
                    }
                edges.append({
                    "id": f"{hostname}-{radius_acc['target']}",
                    "source": hostname,
                    "target": radius_acc["target"],
                    "label": radius_acc["protocol"].upper(),
                    "state": radius_acc["state"],
                    "metadata": radius_acc.get("metadata", {})  # Add metadata to edge if present
                })
        except Exception as e:
            logging.error(f"[!] Failed for device {device['host']}: {e}")

    # Add inter-device connections between all devices in DEVICE_LIST
    device_list = list(device_hostnames.values())
    for i in range(len(device_list)):
        for j in range(i + 1, len(device_list)):
            device1 = device_list[i]
            device2 = device_list[j]
            
            # Check if connection already exists
            existing_connection = any(
                (edge["source"] == device1 and edge["target"] == device2) or
                (edge["source"] == device2 and edge["target"] == device1)
                for edge in edges
            )
            
            if not existing_connection:
                # Find the corresponding IPs for metadata
                device1_ip = next((ip for ip, hostname in device_hostnames.items() if hostname == device1), None)
                device2_ip = next((ip for ip, hostname in device_hostnames.items() if hostname == device2), None)
                
                # Add inter-device connection
                edges.append({
                    "id": f"{device1}-{device2}-interconnect",
                    "source": device1,
                    "target": device2,
                    "label": "Geo-Redundancy",
                    "state": "active",
                    "metadata": {
                        "connection_type": "inter_device",
                        "device1_ip": device1_ip,
                        "device2_ip": device2_ip,
                        "description": f"Direct connection between {device1} and {device2}"
                    }
                })
                logging.info(f"Added inter-device connection: {device1} <-> {device2}")

    return {"nodes": list(nodes.values()), "edges": edges, "device_roles": device_roles}

def save_topology_json(data):
    try:
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        with open(OUTPUT_PATH, "w") as f:
            json.dump(data, f, indent=2)
        logging.info(f"[\u2713] Topology written to {OUTPUT_PATH}")
    except Exception as e:
        logging.error(f"[!] Failed to write topology: {e}")
