import re
import logging
import json

def parse_prompt(prompt):
    return prompt.split("]")[0].strip("[") if "]" in prompt else prompt.strip("#>")

def parse_peers(output):
    lines = output.strip().splitlines()
    parsed = []
    for i, line in enumerate(lines):
        if re.match(r"^-{5,}", line):
            lines = lines[i + 1 :]
            break

    for line in lines:
        if not line.strip():
            continue
        try:
            parts = re.split(r'\s{2,}', line.strip())
            if len(parts) < 10:
                continue
            details_str = parts[9]
            name_match = re.search(r"Name:\s*([^,]+)", details_str)
            status_match = re.search(r"Status:\s*([^,]+)", details_str)

            node_name = name_match.group(1).strip() if name_match else parts[3]
            state = status_match.group(1).strip().lower() if status_match else "unknown"

            # Extra check for node_inactive/node_active
            if state == "node_inactive":
                state = "inactive"
            elif state == "node_active":
                state = "active"

            node_type = (
                "router" if parts[8].lower() == "upf"
                else "radius" if parts[8].lower() == "radius"
                else "cp"
            )

            # Parse extra metadata and labels
            gr_instance = parts[0] if len(parts) > 0 else None
            direction = parts[4] if len(parts) > 4 else None
            connected_time = parts[7] if len(parts) > 7 else None
            interface_name = parts[10] if len(parts) > 10 else None
            vrf = parts[11] if len(parts) > 11 else None
            
            # Tag extra metadata and labels under 'metadata'
            metadata = {
                "gr_instance": gr_instance,
                "direction": direction,
                "connected_time": connected_time,
                "interface_name": interface_name,
                "vrf": vrf
            }

            parsed.append({
                "source": None,
                "target": node_name,
                "type": node_type,
                "label": parts[1],
                "state": state,
                "protocol": parts[8],
                "metadata": metadata
            })
        except Exception as e:
            logging.warning(f"[!] Failed to parse: {line} -> {e}")
    return parsed

def parse_bgp(output):
    peers = []
    for line in output.splitlines():
        if "Establ" in line:
            ip = line.split()[0]
            state = line.split()[3]
            peers.append({"peer": ip, "state": state.lower()})
    return peers

def parse_radius_test_output(output):
    """
    Parse RADIUS test output (authentication/accounting).
    Returns a list of dicts with server info and status.
    """
    parsed = []
    try:
        # Remove timestamp and get only JSON part
        json_str_match = re.search(r'result\s+({.*})', output, re.DOTALL)
        if not json_str_match:
            logging.warning("[!] Could not extract JSON from radius auth output.")
            return parsed
        json_data = json.loads(json_str_match.group(1))
        for entry in json_data.get("testResponse", []):
            try:
                ip = entry.get("serverIP", "unknown")
                port = entry.get("port", "unknown")
                status_info = entry.get("status", {})
                error_code = status_info.get("errorCode", "unknown").lower()
                error_msg = status_info.get("errorMsg", "No error message")
                state = "down" if error_code in ("timeout", "reject", "markeddead") else "up"
                target_id = f"{ip}:{port}"
                metadata = {
                    "ip": ip,
                    "port": port,
                    "error_code": error_code,
                    "error_msg": error_msg,
                }
                parsed.append({
                    "source": None,
                    "target": target_id,
                    "type": "radius",
                    "label": "RadiusServer",
                    "state": state,
                    "protocol": "radius",
                    "metadata": metadata
                })
            except Exception as e:
                logging.warning(f"[!] Failed to parse radius entry: {entry} -> {e}")
    except Exception as e:
        logging.error(f"[!] Failed to parse radius auth output: {e}")
    return parsed 

def parse_role_status(output):
    """
    Parse the output of 'show role instance-id X' command to determine device role
    Returns: dict with instance_id and role (primary/standby)
    """
    try:
        lines = output.strip().splitlines()
        role_info = {}
        
        for line in lines:
            line = line.strip()
            # Look for result "PRIMARY" or result "STANDBY"
            if line.startswith('result'):
                role_match = re.search(r'result\s+"([^"]+)"', line, re.IGNORECASE)
                if role_match:
                    role = role_match.group(1).lower()
                    logging.info(f"Parsed role result: {role}")
                    return role  # Return just the role for this specific instance
        
        return None
    except Exception as e:
        logging.error(f"[!] Failed to parse role status: {e}")
        return None 