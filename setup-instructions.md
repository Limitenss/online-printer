# Print Worker Setup Instructions

To enable physical printing to your Core Innovations Label Printer, follow these steps:

## 1. Install Python Dependencies
Open a terminal on your Windows PC and run:
```powershell
pip install requests pywin32 Pillow
```

## 2. Verify Printer Name
Ensure your printer is named exactly `CTP800BDBY` in Windows Settings. 
If it has a different name, open `print-worker.py` and update the `PRINTER_NAME` variable on line 12.

## 3. Run the Worker
In your project root, run:
```powershell
python print-worker.py
```

## 4. Test the System
1. Keep your Next.js app running (`npm run dev`).
2. Open the app in your browser.
3. Add some text or an image to the design.
4. Click the **Print** button in the sidebar.
5. Watch the terminal where `print-worker.py` is running; it should detect the job and trigger the printer.
