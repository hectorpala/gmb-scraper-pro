#!/usr/bin/env python3
"""
Limpiador de CSV para Google My Business Scraper
- Elimina columnas vacias e innecesarias
- Normaliza campos (trim, caracteres raros)
- Genera CSV limpio
"""

import csv
import re
import sys
import os
from datetime import datetime

# Columnas a ELIMINAR siempre
COLUMNS_TO_REMOVE = {
    'latitude', 'longitude', 'plusCode', 'placeId',
    'allEmails', 'categories',  # redundantes
    'delivery', 'takeout', 'dineIn', 'wifi', 'wheelchair', 'parking',  # atributos poco utiles
    'menuUrl', 'reservationUrl', 'orderUrl',
    'mainPhoto', 'photosCount',
    'topReviewText', 'topReviewRating',
    'claimedBusiness', 'isOpenNow', 'priceLevel',
    'twitter', 'linkedin', 'youtube', 'tiktok'  # redes sociales menos usadas
}

# Columnas prioritarias (orden de salida)
PRIORITY_COLUMNS = [
    'position', 'name', 'category', 'rating', 'reviewCount',
    'phone', 'email', 'website', 'address',
    'instagram', 'facebook', 'whatsapp',
    'hours', 'profileUrl', 'scrapedAt'
]

def normalize_value(value):
    """Normaliza un valor: trim, quita caracteres raros"""
    if value is None:
        return ''
    
    # Convertir a string y trim
    value = str(value).strip()
    
    # Si es vacio o solo espacios
    if not value or value.lower() in ('none', 'null', 'undefined', 'nan'):
        return ''
    
    # Quitar caracteres de control y espacios multiples
    value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
    value = re.sub(r'\s+', ' ', value)
    
    # Quitar comillas extras al inicio/fin
    value = value.strip('"\'')
    
    return value

def normalize_phone(phone):
    """Normaliza numero de telefono"""
    phone = normalize_value(phone)
    if not phone:
        return ''
    
    # Quitar todo excepto digitos y +
    digits = re.sub(r'[^\d+]', '', phone)
    
    # Si tiene muy pocos digitos, no es valido
    if len(digits.replace('+', '')) < 7:
        return ''
    
    return phone

def normalize_email(email):
    """Normaliza email"""
    email = normalize_value(email).lower()
    if not email:
        return ''
    
    # Validar formato basico
    if '@' not in email or '.' not in email.split('@')[-1]:
        return ''
    
    # Filtrar emails invalidos comunes
    invalid_patterns = ['example', 'test@', 'email@', '@sentry', 'webpack', '.png', '.jpg']
    for pattern in invalid_patterns:
        if pattern in email:
            return ''
    
    return email

def normalize_url(url):
    """Normaliza URL"""
    url = normalize_value(url)
    if not url:
        return ''
    
    # Agregar https si no tiene protocolo
    if url and not url.startswith(('http://', 'https://')):
        if '.' in url:
            url = 'https://' + url
    
    return url

def is_column_empty(rows, column_idx):
    """Verifica si una columna esta completamente vacia"""
    for row in rows:
        if column_idx < len(row) and normalize_value(row[column_idx]):
            return False
    return True

def clean_csv(input_file, output_file=None):
    """Limpia un archivo CSV"""
    
    if not os.path.exists(input_file):
        print(f"Error: Archivo no encontrado: {input_file}")
        return None
    
    # Generar nombre de salida si no se especifica
    if output_file is None:
        base, ext = os.path.splitext(input_file)
        output_file = base + '_limpio' + ext
    
    # Leer CSV
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    if len(rows) < 2:
        print("Error: CSV vacio o sin datos")
        return None
    
    headers = rows[0]
    data_rows = rows[1:]
    
    print(f"\n{'='*50}")
    print(f"LIMPIEZA DE CSV")
    print(f"{'='*50}")
    print(f"Archivo: {input_file}")
    print(f"Filas originales: {len(data_rows)}")
    print(f"Columnas originales: {len(headers)}")
    
    # Identificar columnas a mantener
    columns_to_keep = []
    columns_removed = []
    
    for idx, header in enumerate(headers):
        header_lower = header.lower().strip()
        
        # Eliminar columnas en la lista negra
        if header_lower in COLUMNS_TO_REMOVE or header in COLUMNS_TO_REMOVE:
            columns_removed.append(header)
            continue
        
        # Eliminar columnas completamente vacias
        if is_column_empty(data_rows, idx):
            columns_removed.append(f"{header} (vacia)")
            continue
        
        columns_to_keep.append((idx, header))
    
    print(f"\nColumnas eliminadas ({len(columns_removed)}):")
    for col in columns_removed[:10]:
        print(f"  - {col}")
    if len(columns_removed) > 10:
        print(f"  ... y {len(columns_removed) - 10} mas")
    
    # Ordenar columnas segun prioridad
    def get_priority(header):
        header_lower = header.lower()
        try:
            return PRIORITY_COLUMNS.index(header_lower)
        except ValueError:
            return 999
    
    columns_to_keep.sort(key=lambda x: get_priority(x[1]))
    
    # Construir nuevo CSV
    new_headers = [col[1] for col in columns_to_keep]
    new_rows = []
    
    for row in data_rows:
        new_row = []
        for idx, header in columns_to_keep:
            value = row[idx] if idx < len(row) else ''
            
            # Aplicar normalizacion segun tipo de campo
            header_lower = header.lower()
            if 'phone' in header_lower or 'tel' in header_lower:
                value = normalize_phone(value)
            elif 'email' in header_lower:
                value = normalize_email(value)
            elif 'url' in header_lower or 'website' in header_lower or header_lower in ('instagram', 'facebook', 'twitter', 'linkedin', 'youtube', 'tiktok'):
                value = normalize_url(value)
            else:
                value = normalize_value(value)
            
            new_row.append(value)
        
        # Solo agregar filas que tengan al menos nombre
        if new_row and new_row[new_headers.index('name') if 'name' in new_headers else 0]:
            new_rows.append(new_row)
    
    # Escribir CSV limpio
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(new_headers)
        writer.writerows(new_rows)
    
    print(f"\nColumnas finales ({len(new_headers)}):")
    print(f"  {', '.join(new_headers)}")
    print(f"\nFilas finales: {len(new_rows)}")
    print(f"\nArchivo limpio: {output_file}")
    print(f"{'='*50}\n")
    
    return output_file

def clean_all_csvs_in_folder(folder):
    """Limpia todos los CSVs en una carpeta"""
    cleaned = []
    for filename in os.listdir(folder):
        if filename.endswith('.csv') and '_limpio' not in filename:
            input_path = os.path.join(folder, filename)
            output_path = clean_csv(input_path)
            if output_path:
                cleaned.append(output_path)
    return cleaned

if __name__ == '__main__':
    if len(sys.argv) < 2:
        # Si no hay argumentos, limpiar el ultimo CSV en output/
        output_dir = os.path.join(os.path.dirname(__file__), '..', 'output')
        csvs = [f for f in os.listdir(output_dir) if f.endswith('.csv') and '_limpio' not in f]
        if csvs:
            csvs.sort(key=lambda x: os.path.getmtime(os.path.join(output_dir, x)), reverse=True)
            latest = os.path.join(output_dir, csvs[0])
            print(f"Limpiando ultimo CSV: {csvs[0]}")
            clean_csv(latest)
        else:
            print("Uso: python cleanCSV.py <archivo.csv>")
            print("     python cleanCSV.py --all  (limpia todos en output/)")
    elif sys.argv[1] == '--all':
        output_dir = os.path.join(os.path.dirname(__file__), '..', 'output')
        clean_all_csvs_in_folder(output_dir)
    else:
        clean_csv(sys.argv[1])
