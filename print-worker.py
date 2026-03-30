import time
import requests
import base64
import os
import win32print
import win32ui
from PIL import Image, ImageWin

# --- Configuration ---
# You can override these with environment variables on your local machine
API_URL = os.getenv(
    "PRINT_API_URL", "https://online-printer.vercel.app/api/print-queue"
)
PRINTER_NAME = os.getenv("PRINTER_NAME", "CTP800BD")
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "0.1"))
API_KEY = os.getenv("PRINT_API_KEY", "YOUR_API_KEY_HERE")
BATCH_SIZE = 4  # Number of jobs to combine into one page

current_batch = []


def get_headers():
    return {"x-api-key": API_KEY}


def combine_images(image_paths, target_w, target_h):
    """Combines 4 images into a 2x2 grid fitting target_w x target_h."""
    grid = Image.new("1", (target_w, target_h), 1)  # White background
    quad_w = target_w // 2
    quad_h = target_h // 2

    positions = [(0, 0), (quad_w, 0), (0, quad_h), (quad_w, quad_h)]

    for i, path in enumerate(image_paths):
        if i >= 4:
            break
        
        try:
            # 1. Open and convert to RGBA to handle potential transparency
            src_img = Image.open(path).convert("RGBA")
            
            # 2. Composite onto a solid white background (removes black transparency holes)
            canvas = Image.new("RGBA", src_img.size, (255, 255, 255, 255))
            canvas.alpha_composite(src_img)
            
            # 3. Scale down to fit quadrant (keep aspect ratio)
            canvas.thumbnail((quad_w, quad_h), Image.Resampling.LANCZOS)
            
            # 4. Convert to 1-bit monochrome
            final_quad = canvas.convert("1")
            
            # 5. Center in quadrant
            offset_x = (quad_w - final_quad.width) // 2
            offset_y = (quad_h - final_quad.height) // 2
            grid.paste(final_quad, (positions[i][0] + offset_x, positions[i][1] + offset_y))
        except Exception as e:
            print(f"Error processing image {path}: {e}")

    return grid


def print_batch(batch_jobs):
    try:
        # Check if printer exists
        printers = [p[2] for p in win32print.EnumPrinters(2)]
        if PRINTER_NAME not in printers:
            print(f"Error: Printer '{PRINTER_NAME}' not found. Available: {printers}")
            return False

        # Create DC
        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(PRINTER_NAME)
        printable_w = hdc.GetDeviceCaps(8)
        printable_h = hdc.GetDeviceCaps(10)

        # 1. Merge images
        image_paths = [j["path"] for j in batch_jobs]
        merged_img = combine_images(image_paths, printable_w, printable_h)

        # 2. Print
        hdc.StartDoc("BatchPrintJob")
        hdc.StartPage()
        dib = ImageWin.Dib(merged_img)
        handle = int(hdc.GetSafeHdc())
        dib.draw(handle, (0, 0, printable_w, printable_h))
        hdc.EndPage()
        hdc.EndDoc()
        hdc.DeleteDC()

        print(f"Successfully printed batch of {len(batch_jobs)} jobs.")
        return True
    except Exception as e:
        print(f"Batch printing error: {e}")
        return False


def main():
    global current_batch
    print(f"Starting Quadrant Print Worker (Batch Size: {BATCH_SIZE})...")
    print(f"Polling {API_URL} every {POLL_INTERVAL}s")

    while True:
        try:
            response = requests.get(API_URL, headers=get_headers())
            if response.status_code == 200:
                data = response.json()
                job = data.get("job")

                if job:
                    job_id = job["id"]
                    print(
                        f"Queued job {job_id} ({len(current_batch) + 1}/{BATCH_SIZE})"
                    )

                    # 1. Decode & Save Temporary Image
                    image_data = job["image"]
                    if "," in image_data:
                        image_data = image_data.split(",")[1]

                    temp_file = f"temp_{job_id}.png"
                    with open(temp_file, "wb") as f:
                        f.write(base64.b64decode(image_data))

                    current_batch.append({"id": job_id, "path": temp_file})

                    # 2. Check if batch is full
                    if len(current_batch) >= BATCH_SIZE:
                        print("Batch full. Processing...")
                        if print_batch(current_batch):
                            # Success! Mark all as complete
                            for b_job in current_batch:
                                requests.post(
                                    f"{API_URL}/{b_job['id']}/complete",
                                    headers=get_headers(),
                                )
                                if os.path.exists(b_job["path"]):
                                    os.remove(b_job["path"])
                            current_batch = []
                        else:
                            print("Batch print failed. Keeping in buffer to retry.")

                    continue  # Check for next job immediately

            elif response.status_code != 200:
                print(f"API Error: {response.status_code}")

        except Exception as e:
            print(f"Worker Loop Error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
