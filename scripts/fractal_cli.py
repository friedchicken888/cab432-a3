import os
import requests
import json
import jwt
from dotenv import load_dotenv
import os

BASE_URL = ""

load_dotenv()

current_user_info = None
current_token = None

def login(username, password):
    global current_token, current_user_info
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
        r.raise_for_status()
        data = r.json()

        if r.status_code == 202 and data.get('challengeName') == 'EMAIL_OTP':
            clear_terminal()
            print("\nMFA challenge initiated. Please check your email for a verification code.")
            mfa_code = input("Enter MFA code: ")
            return confirm_mfa(username, mfa_code, data['session'])

        current_token = data['idToken']
        
        decoded_token = jwt.decode(current_token, options={"verify_signature": False}) 
        current_user_info = decoded_token
        
        print(f"Logged in as {current_user_info.get('cognito:username', username)}.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Login failed: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")
        current_token = None
        current_user_info = None
        return False

def confirm_mfa(username, mfa_code, session):
    global current_token, current_user_info
    try:
        r = requests.post(f"{BASE_URL}/auth/confirm-mfa", json={"username": username, "mfaCode": mfa_code, "session": session})
        r.raise_for_status()
        data = r.json()
        current_token = data['idToken']
        
        decoded_token = jwt.decode(current_token, options={"verify_signature": False}) 
        current_user_info = decoded_token
        
        print(f"Logged in as {current_user_info.get('cognito:username', username)}.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"MFA confirmation failed: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")
        current_token = None
        current_user_info = None
        return False

def signup(username, email, password):
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={"username": username, "email": email, "password": password})
        r.raise_for_status()
        print(f"Sign up successful for {username}. Please check your email to confirm your account.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Sign up failed: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")
        return False

def confirm_signup(username, confirmation_code):
    try:
        r = requests.post(f"{BASE_URL}/auth/confirm", json={"username": username, "confirmationCode": confirmation_code})
        r.raise_for_status()
        print(f"Account for {username} confirmed successfully.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Confirmation failed: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")
        return False

def generate_fractal():
    if not current_token:
        print("Please log in first.")
        return

    print("\n--- Generate Fractal ---")
    print("Enter parameters (leave blank for default/random):")
    width = input("Width (default 1920): ")
    height = input("Height (default 1080): ")
    iterations = input("Max Iterations (default 500): ")
    power = input("Power (default 2): ")
    c_real = input("C Real (default 0.285): ")
    c_imag = input("C Imag (default 0.01): ")
    scale = input("Scale (default 1): ")
    offset_x = input("Offset X (default 0): ")
    offset_y = input("Offset Y (default 0): ")
    colour_scheme = input("Colour Scheme (rainbow, grayscale, fire, hsl - default rainbow): ")

    params = {}
    if width: params["width"] = int(width)
    if height: params["height"] = int(height)
    if iterations: params["iterations"] = int(iterations)
    if power: params["power"] = float(power)
    if c_real: params["real"] = float(c_real)
    if c_imag: params["imag"] = float(c_imag)
    if scale: params["scale"] = float(scale)
    if offset_x: params["offsetX"] = float(offset_x)
    if offset_y: params["offsetY"] = float(offset_y)
    if colour_scheme: params["color"] = colour_scheme

    headers = {"Authorization": f"Bearer {current_token}"}
    try:
        r = requests.get(f"{BASE_URL}/fractal", headers=headers, params=params, timeout=180)
        r.raise_for_status()
        data = r.json()
        fractal_url = data.get('url')
        fractal_hash = data.get('hash')
        if fractal_url:
            print(f"\nFractal generated successfully! URL: {fractal_url}")
        elif fractal_hash:
            print(f"\nFractal generated successfully! Hash: {fractal_hash}")
        else:
            print(f"\nFractal generated successfully! Unexpected response: {data}")
    except requests.exceptions.RequestException as e:
        print(f"\nFractal generation failed: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")

def view_data(view_type="my_gallery", limit=None, offset=None, filters=None, sortBy=None, sortOrder=None, prompt_for_options=True):
    if not current_token:
        print("Please log in first.")
        return

    endpoint = ""
    title = ""
    
    user_role = current_user_info.get('custom:role', 'user')

    if view_type == "my_gallery":
        endpoint = "/gallery"
        title = "My Gallery"
    elif view_type == "all_history":
        endpoint = "/admin/history"
        title = "All History"
    elif view_type == "all_gallery":
        endpoint = "/admin/gallery"
        title = "All Gallery"
    else:
        print("Invalid view type.")
        return

    query_params = {}

    if prompt_for_options:
        print("\n--- Filters, Sorting, and Pagination Options (leave blank for default/skip) ---")
        
        filters = {}
        colourScheme = input("Colour Scheme: ")
        if colourScheme: filters["colourScheme"] = colourScheme
        power = input("Power: ")
        if power: filters["power"] = float(power)
        iterations = input("Max Iterations: ")
        if iterations: filters["iterations"] = int(iterations)
        width = input("Width: ")
        if width: filters["width"] = int(width)
        height = input("Height: ")
        if height: filters["height"] = int(height)

        # Sorting
        sortBy = input("Sort By (e.g., added_at, hash, width - leave blank for default): ")
        sortOrder = input("Sort Order (ASC/DESC - leave blank for default): ")

        # Pagination
        limit_input = input(f"Enter limit (leave blank for default 5): ")
        offset_input = input(f"Enter offset (leave blank for default 0): ")
        limit = int(limit_input) if limit_input else None
        offset = int(offset_input) if offset_input else 0

    else:
        filters = filters or {}
        limit = limit if limit is not None else 5
        offset = offset if offset is not None else 0
        sortBy = sortBy
        sortOrder = sortOrder

    if filters:
        for k, v in filters.items():
            query_params[k] = v

    if limit is not None: query_params["limit"] = int(limit)
    if offset is not None: query_params["offset"] = int(offset)
    if sortBy: query_params["sortBy"] = sortBy
    if sortOrder: query_params["sortOrder"] = sortOrder

    clear_terminal()

    headers = {"Authorization": f"Bearer {current_token}"}
    try:
        r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=query_params)
        r.raise_for_status()
        response_data = r.json()
        data = response_data.get('data', [])
        total_count = int(response_data.get('totalCount', len(data)))
        current_limit = response_data.get('limit', len(data))
        current_offset = response_data.get('offset', 0)

        if data:
            print(f"\n--- {title} (Total: {total_count}, Showing {current_offset}-{current_offset + len(data)} of {total_count}) ---")
            for entry in data:
                timestamp_field = 'added_at' if 'added_at' in entry else 'generated_at'
                user_info = ""
                if view_type == "all_gallery" and 'username' in entry:
                    user_info = f", User: {entry.get('username')}"
                elif view_type == "all_gallery" and 'user_id' in entry:
                    user_info = f", Owner ID: {entry.get('user_id')}"
                elif 'username' in entry:
                    user_info = f", User: {entry.get('username')}"
                
                fractal_deleted = entry.get('fractal_deleted', False)

                if fractal_deleted:
                    print(f"ID: {entry.get('id')}, Status: Fractal Deleted{user_info}, Time: {entry.get(timestamp_field)}\n")
                else:
                    fractal_hash = entry.get('hash')
                    display_hash = fractal_hash[:8] + '...' if fractal_hash else 'N/A'
                    
                    width = entry.get('width', 'N/A')
                    height = entry.get('height', 'N/A')
                    iterations = entry.get('iterations', 'N/A')
                    power = entry.get('power', 'N/A')
                    c_real = entry.get('c_real', 'N/A')
                    c_imag = entry.get('c_imag', 'N/A')
                    scale = entry.get('scale', 'N/A')
                    offset_x = entry.get('offsetX', 'N/A')
                    offset_y = entry.get('offsetY', 'N/A')
                    colour_scheme = entry.get('colourScheme', 'N/A')

                    print(f"ID: {entry.get('id')}, Hash: {display_hash}{user_info}, Time: {entry.get(timestamp_field)}")
                    print(f"  Params: W:{width}, H:{height}, Iter:{iterations}, Power:{power}, C:{c_real}+{c_imag}i, Scale:{scale}, Offset:{offset_x},{offset_y}, Colour:{colour_scheme}\n")
            
            # New interactive section
            while True:
                has_more_pages = current_offset + len(data) < total_count
                can_go_back = current_offset > 0

                nav_options = []
                if can_go_back:
                    nav_options.append("1 for previous page")
                if has_more_pages:
                    nav_options.append("2 for next page")
                nav_options.append("0 to get link from ID")
                nav_options.append("Enter to continue")

                prompt_text = "Enter " + ", ".join(nav_options) + ": "
                action = input(prompt_text).strip()
                
                if not action:
                    break
                
                if action == '1': # Previous Page
                    if can_go_back:
                        clear_terminal()
                        offset = max(0, offset - current_limit)
                        return {'data': data, 'totalCount': total_count, 'limit': current_limit, 'offset': offset, 'filters': filters, 'sortBy': sortBy, 'sortOrder': sortOrder, 're_render': True}
                    else:
                        print("\nAlready on the first page.\n")
                elif action == '2': # Next Page
                    if has_more_pages:
                        clear_terminal()
                        offset += current_limit
                        return {'data': data, 'totalCount': total_count, 'limit': current_limit, 'offset': offset, 'filters': filters, 'sortBy': sortBy, 'sortOrder': sortOrder, 're_render': True}
                    else:
                        print("\nAlready on the last page.\n")
                elif action == '0': # Get link from ID
                    id_input = input("Enter the ID to get its URL: ").strip()
                    try:
                        selected_id = int(id_input)
                        found_entry = next((e for e in data if e.get('id') == selected_id), None)
                        if found_entry:
                            if found_entry.get('url'):
                                print(f"\nURL for ID {selected_id}: {found_entry['url']}\n")
                            else:
                                print(f"\nNo URL available for ID {selected_id} (fractal might be deleted).\n")
                        else:
                            print(f"\nNo entry found with ID {selected_id} on this page.\n")
                    except ValueError:
                        print("\nInvalid input. Please enter a valid ID number.\n")
                else:
                    print("\nInvalid input. Please enter 1, 2, 0, or press Enter.\n")

            return {'data': data, 'totalCount': total_count, 'limit': current_limit, 'offset': current_offset, 'filters': filters, 'sortBy': sortBy, 'sortOrder': sortOrder}
        else:
            print(f"No {title.lower()} items found for the current query.")
            input("Press Enter to continue...")
            return {'data': [], 'totalCount': total_count, 'limit': current_limit, 'offset': current_offset, 'filters': filters, 'sortBy': sortBy, 'sortOrder': sortOrder}
    except requests.exceptions.RequestException as e:
        print(f"\nFailed to retrieve {title.lower()}: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")
        else:
            print(f"No HTTP response received. Error: {e}")
        input("Press Enter to continue...")
        return

def clear_terminal():
    os.system('cls' if os.name == 'nt' else 'clear')

def delete_gallery_entry():
    if not current_token:
        print("Please log in first.")
        return

    gallery_id = input("Enter Gallery ID to delete: ")
    if not gallery_id.isdigit():
        print("Invalid ID. Please enter a number.")
        return

    headers = {"Authorization": f"Bearer {current_token}"}
    try:
        r = requests.delete(f"{BASE_URL}/gallery/{gallery_id}", headers=headers)
        r.raise_for_status()
        print(f"Gallery entry {gallery_id} deleted successfully.")
    except requests.exceptions.RequestException as e:
        print(f"Failed to delete gallery entry {gallery_id}: {e}")
        if e.response is not None:
            print(f"HTTP Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")

def quick_login():
    global current_token, current_user_info
    clear_terminal()
    print("\n--- Quick Login ---")
    print("1. Login as Regular User")
    print("2. Login as Admin")
    choice = input("\nEnter your choice: ")

    username = ""
    password = ""

    if choice == "1":
        username = os.getenv('USER_USERNAME')
        password = os.getenv('USER_PASSWORD')
        if not username or not password:
            print("Error: USER_USERNAME or USER_PASSWORD not set in .env")
            input("Press Enter to continue...")
            return
    elif choice == "2":
        username = os.getenv('ADMIN_USERNAME')
        password = os.getenv('ADMIN_PASSWORD')
        if not username or not password:
            print("Error: ADMIN_USERNAME or ADMIN_PASSWORD not set in .env")
            input("Press Enter to continue...")
            return
    else:
        print("Invalid choice.")
        input("Press Enter to continue...")
        return

    if login(username, password):
        user_menu()
        current_user_info = None
        current_token = None
    else:
        input("\nPress Enter to continue...")

def auth_menu():
    global current_user_info, current_token
    while True:
        clear_terminal()
        print("\n--- Authentication Menu ---")
        print("1. Login")
        print("2. Sign Up")
        print("3. Confirm Sign Up")
        print("4. Quick Login")
        print("5. Exit")
        choice = input("\nEnter your choice: ")

        if choice == "1":
            clear_terminal()
            print("\n--- Login ---")
            username = input("Enter username: ")
            password = input("Enter password: ")
            if login(username, password):
                user_menu()
                current_user_info = None
                current_token = None
            else:
                input("\nPress Enter to continue...")
        elif choice == "2":
            clear_terminal()
            print("\n--- Sign Up ---")
            username = input("Enter username: ")
            email = input("Enter email: ")
            password = input("Enter password: ")
            signup(username, email, password)
            input("\nPress Enter to continue...")
        elif choice == "3":
            clear_terminal()
            print("\n--- Confirm Sign Up ---")
            username = input("Enter username: ")
            confirmation_code = input("Enter confirmation code from email: ")
            confirm_signup(username, confirmation_code)
            input("\nPress Enter to continue...")
        elif choice == "4":
            quick_login()
        elif choice == "5":
            clear_terminal()
            print("\nExiting CLI. Goodbye!")
            break
        else:
            print("\nInvalid choice. Please try again.")
            input("Press Enter to continue...")

def user_menu():
    global current_user_info, current_token
    while True:
        clear_terminal()
        if current_user_info:
            user_role = 'user'
            if current_user_info.get('cognito:groups') and 'admin' in current_user_info.get('cognito:groups'):
                user_role = 'admin'
            username = current_user_info.get('cognito:username', 'Unknown')
            print(f"Logged in as: {username} (Role: {user_role})")
        else:
            print("Not logged in.")

        print("\n--- Main Menu ---")

        print("1. Generate Fractal")
        print("2. View My Gallery")
        print("3. View All History (Admin)")
        print("4. View All Gallery (Admin)")
        print("5. Delete Gallery Entry")
        print("6. Logout")
        print("7. Exit")

        print()
        choice = input("Enter your choice: ")

        if choice == "1":
            clear_terminal()
            generate_fractal()
            input("\nPress Enter to continue...")
        elif choice == "2":
            current_limit = None
            current_offset = 0
            clear_terminal()
            print("\n--- View My Gallery ---")
            
            use_options_input = input("Do you want to apply filters, sorting, or pagination? (y/n): ").lower()
            prompt_for_options_my_gallery = (use_options_input == 'y')

            limit = None
            offset = 0
            filters = None
            sortBy = None
            sortOrder = None

            while True:
                result = view_data(view_type="my_gallery", limit=limit, offset=offset, filters=filters, sortBy=sortBy, sortOrder=sortOrder, prompt_for_options=prompt_for_options_my_gallery)
                
                if result:
                    current_limit = result['limit']
                    current_offset = result['offset']
                    total_count = result['totalCount']
                    filters = result['filters']
                    sortBy = result['sortBy']
                    sortOrder = result['sortOrder']
                    prompt_for_options_my_gallery = False
                    
                    if result.get('re_render'):
                        offset = result['offset']
                        continue
                    else:
                        break
                else:
                    break
        
        elif choice == "3":
            current_limit = None
            current_offset = 0
            print("\n--- View All History (Admin) ---")

            use_options_input = input("Do you want to apply filters, sorting, or pagination? (y/n): ").lower()
            prompt_for_options_all_history = (use_options_input == 'y')

            limit = None
            offset = 0
            filters = None
            sortBy = None
            sortOrder = None

            while True:
                result = view_data(view_type="all_history", limit=limit, offset=offset, filters=filters, sortBy=sortBy, sortOrder=sortOrder, prompt_for_options=prompt_for_options_all_history)
                
                if result:
                    current_limit = result['limit']
                    current_offset = result['offset']
                    total_count = result['totalCount']
                    filters = result['filters']
                    sortBy = result['sortBy']
                    sortOrder = result['sortOrder']
                    prompt_for_options_all_history = False
                    
                    if result.get('re_render'):
                        offset = result['offset']
                        continue
                    else:
                        break
                else:
                    break
        elif choice == "4":
            current_limit = None
            current_offset = 0
            print("\n--- View All Gallery (Admin) ---")

            use_options_input = input("Do you want to apply filters, sorting, or pagination? (y/n): ").lower()
            prompt_for_options_all_gallery = (use_options_input == 'y')

            limit = None
            offset = 0
            filters = None
            sortBy = None
            sortOrder = None

            while True:
                result = view_data(view_type="all_gallery", limit=limit, offset=offset, filters=filters, sortBy=sortBy, sortOrder=sortOrder, prompt_for_options=prompt_for_options_all_gallery)
                
                if result:
                    current_limit = result['limit']
                    current_offset = result['offset']
                    total_count = result['totalCount']
                    filters = result['filters']
                    sortBy = result['sortBy']
                    sortOrder = result['sortOrder']
                    prompt_for_options_all_gallery = False
                    
                    if result.get('re_render'):
                        offset = result['offset']
                        continue
                    else:
                        break
                else:
                    break
        elif choice == "5":
            clear_terminal()
            delete_gallery_entry()
            input("\nPress Enter to continue...")
            
        elif choice == "6":
            current_user_info = None
            current_token = None
            print("\nLogged out successfully.")
            input("Press Enter to continue...")
            break
        elif choice == "7":
            clear_terminal()
            print("\nExiting CLI. Goodbye!")
            exit()
        else:
            print("\nInvalid choice. Please try again.")
            input("Press Enter to continue...")

def main_menu():
    global BASE_URL
    ip_address = os.getenv('SERVER_IP', 'localhost')
    print(f"Using server IP from .env: {ip_address}")
    BASE_URL = f"http://{ip_address}:3000/api"

    auth_menu()

if __name__ == "__main__":
    main_menu()
