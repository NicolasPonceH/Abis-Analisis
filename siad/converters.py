import os

def convert_image_to_pdf(input_path, output_path):
    from PIL import Image
    image = Image.open(input_path)
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.save(output_path, "PDF", resolution=100.0)

def convert_text_to_pdf(input_path, output_path):
    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    # Agregar un título formal
    pdf.set_font("helvetica", style="B", size=11)
    pdf.cell(0, 10, text="REPORTE DE TEXTO DIRECTO", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    import re
    # Leer e insertar el texto completo
    pdf.set_font("helvetica", size=10)
    with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read().strip()
    
    # Normalizar saltos de línea (Windows \r\n -> \n) y eliminar saltos de línea excesivos
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Reemplazar viñetas comunes manualmente para que no se pierdan como '?'
    text = text.replace('•', '-')
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('‘', "'").replace('’', "'")
    text = text.replace('–', '-').replace('—', '-')
    
    # FPDF con fuentes estándar solo soporta Latin-1. 
    # Reemplazamos cualquier otro carácter Unicode no soportado con '?' para evitar que el programa falle.
    text = text.encode('latin-1', 'replace').decode('latin-1')
    
    # multi_cell se encarga de los saltos de línea (\n) y ajustar el texto al ancho
    pdf.multi_cell(0, 5, text=text)
    pdf.output(output_path)

def convert_word_to_pdf(input_path, output_path):
    import win32com.client
    import pythoncom
    pythoncom.CoInitialize()
    # wdFormatPDF = 17
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    try:
        doc = word.Documents.Open(os.path.abspath(input_path))
        doc.SaveAs(os.path.abspath(output_path), FileFormat=17)
        doc.Close()
    finally:
        word.Quit()
        pythoncom.CoUninitialize()

def convert_excel_to_pdf(input_path, output_path):
    import win32com.client
    import pythoncom
    pythoncom.CoInitialize()
    # xlTypePDF = 0
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    try:
        wb = excel.Workbooks.Open(os.path.abspath(input_path))
        wb.ExportAsFixedFormat(0, os.path.abspath(output_path))
        wb.Close(False)
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

def convert_ppt_to_pdf(input_path, output_path):
    import win32com.client
    import pythoncom
    pythoncom.CoInitialize()
    # ppSaveAsPDF = 32
    ppt = win32com.client.DispatchEx("PowerPoint.Application")
    try:
        presentation = ppt.Presentations.Open(os.path.abspath(input_path), WithWindow=False)
        presentation.SaveAs(os.path.abspath(output_path), 32)
        presentation.Close()
    finally:
        ppt.Quit()
        pythoncom.CoUninitialize()

def convert_to_pdf(input_path, output_path):
    """
    Convierte el archivo en input_path a un PDF guardado en output_path.
    Retorna True si fue exitoso, lanza una excepcion si falla.
    """
    ext = input_path.rsplit(".", 1)[-1].lower() if "." in input_path else ""
    
    if ext in ["png", "jpg", "jpeg", "bmp", "tiff"]:
        convert_image_to_pdf(input_path, output_path)
    elif ext in ["txt", "csv", "log"]:
        convert_text_to_pdf(input_path, output_path)
    elif ext in ["docx", "doc"]:
        convert_word_to_pdf(input_path, output_path)
    elif ext in ["xlsx", "xls"]:
        convert_excel_to_pdf(input_path, output_path)
    elif ext in ["pptx", "ppt"]:
        convert_ppt_to_pdf(input_path, output_path)
    else:
        raise ValueError(f"Formato no soportado para conversion: {ext}")
    return True
