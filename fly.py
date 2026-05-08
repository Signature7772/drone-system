from pymavlink import mavutil
import time
import glob
import os
import csv

print("🔍 Шукаємо файл місії (.waypoints) у папці...")
wp_files = glob.glob("*.waypoints")

if not wp_files:
    print("❌ Помилка: У папці немає жодного файлу .waypoints!")
    exit()

FILE_NAME = wp_files[0]
print(f"✅ Знайдено файл: {FILE_NAME}")

print("🔌 Підключення до дрона...")
master = mavutil.mavlink_connection('tcp:127.0.0.1:5762')
master.wait_heartbeat()
print("✅ З'єднання встановлено!")

master.mav.request_data_stream_send(master.target_system, master.target_component, mavutil.mavlink.MAV_DATA_STREAM_ALL, 1, 1)

print("🛰 Очікування GPS-сигналу...")
while True:
    msg = master.recv_match(type='GPS_RAW_INT', blocking=True, timeout=2)
    if msg and msg.fix_type >= 3: 
        print("✅ GPS сигнал стабільний (3D Fix)!")
        break
    time.sleep(1)

print("⏳ Вимикаємо перевірки безпеки (Arming Checks)...")
master.param_set_send("ARMING_CHECK", 0)
time.sleep(1)

commands = []
with open(FILE_NAME, "r") as f:
    lines = f.readlines()
    for line in lines[1:]: 
        parts = line.strip().split('\t')
        if len(parts) >= 12:
            commands.append(parts)

print(f"📂 Прочитано {len(commands)} команд з файлу.")

print("🗑 Очищення та завантаження місії...")
master.mav.mission_clear_all_send(master.target_system, master.target_component)
master.recv_match(type='MISSION_ACK', blocking=True)
master.mav.mission_count_send(master.target_system, master.target_component, len(commands))

for i, cmd in enumerate(commands):
    msg = master.recv_match(type=['MISSION_REQUEST_INT', 'MISSION_REQUEST'], blocking=True, timeout=3)
    command_id = int(cmd[3])
    if command_id == 16:
        master.mav.mission_item_int_send(master.target_system, master.target_component, i, int(cmd[2]), command_id, 0, 1, 0, 0, 0, 0, int(float(cmd[8]) * 1e7), int(float(cmd[9]) * 1e7), float(cmd[10]))
    else:
        master.mav.mission_item_int_send(master.target_system, master.target_component, i, int(cmd[2]), command_id, 0, 1, float(cmd[4]), float(cmd[5]), float(cmd[6]), float(cmd[7]), 0, 0, 0)
        
master.recv_match(type='MISSION_ACK', blocking=True, timeout=3)
print("✅ Місію успішно завантажено!")

master.waypoint_set_current_send(1)
time.sleep(0.5)

msg = master.recv_match(type='HEARTBEAT', blocking=True)
is_armed = msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED

if not is_armed:
    print("🚀 Зміна режиму на GUIDED...")
    master.mav.set_mode_send(master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
    time.sleep(1) 

    print("🔥 ПРИМУСОВИЙ запуск моторів (Force Arming)...")
    armed_successfully = False
    for attempt in range(5):
        master.mav.command_long_send(master.target_system, master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 21196, 0, 0, 0, 0, 0)
        start_time = time.time()
        while time.time() - start_time < 2:
            msg = master.recv_match(type=['HEARTBEAT', 'STATUSTEXT'], blocking=False)
            if msg and msg.get_type() == 'HEARTBEAT' and (msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED):
                armed_successfully = True
                break
        if armed_successfully:
            print("✅ Мотори успішно заведені!")
            break
        else:
            print(f"⚠️ Спроба {attempt+1} не вдалася...")
    
    if not armed_successfully:
        print("❌ Не вдалося завести мотори.")
        exit()

    print("⏳ Очікування стабілізації моторів (3 сек)...")
    time.sleep(3)

    print("🚁 Відправка команди на зліт (15 метрів)...")
    master.mav.command_long_send(master.target_system, master.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 15)
    
    print("⏳ Чекаємо набору висоти...")
    while True:
        msg = master.recv_match(type='GLOBAL_POSITION_INT', blocking=True, timeout=2)
        if msg and (msg.relative_alt / 1000.0) > 10.0:
            print(f"⬆️ Висота набрана: {msg.relative_alt / 1000.0}м!")
            break
        time.sleep(0.5)

# === ЗАПУСК МІСІЇ ТА ЗАПИС ПОВНОГО ЛОГУ ===
print("🎯 Перемикання в режим AUTO. Дрон летить по маршруту!")
master.mav.set_mode_send(master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 3)

total_waypoints = len(commands)
print("\n📡 Слідкуємо за місією та записуємо лог телеметрії...")

log_file = open("flight_log.csv", mode="w", newline="")
log_writer = csv.writer(log_file)
log_writer.writerow(["time", "lat", "lng", "alt", "speed", "battery", "satellites"])

start_time = time.time()
last_battery = 12.6
last_sats = 10
mission_finished = False # Прапорець, щоб знати, коли місія виконана

while True:
    msg = master.recv_match(blocking=True, timeout=1)
    if not msg:
        continue
        
    msg_type = msg.get_type()
    
    if msg_type == 'SYS_STATUS':
        last_battery = msg.voltage_battery / 1000.0
    elif msg_type == 'GPS_RAW_INT':
        last_sats = msg.satellites_visible
    elif msg_type == 'GLOBAL_POSITION_INT':
        current_time = round(time.time() - start_time, 1)
        lat = msg.lat / 1e7
        lng = msg.lon / 1e7
        alt = msg.relative_alt / 1000.0
        speed = ((msg.vx / 100.0)**2 + (msg.vy / 100.0)**2)**0.5
        log_writer.writerow([current_time, lat, lng, alt, round(speed, 2), last_battery, last_sats])
        
    elif msg_type == 'MISSION_CURRENT':
        current_wp = msg.seq
        if not mission_finished:
            print(f"✈️ Прямує до точки: {current_wp} / {total_waypoints - 1}", end='\r')
            if current_wp >= total_waypoints - 1:
                print("\n✅ Місію завершено! Повернення на базу (RTL)...")
                mission_finished = True

    # Якщо місія завершена, чекаємо моменту, коли дрон сяде і вимкне мотори
    elif msg_type == 'HEARTBEAT' and mission_finished:
        is_armed = msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED
        if not is_armed:
            print("🛬 Дрон успішно приземлився та вимкнув мотори.")
            break # Тільки тепер зупиняємо запис логу

log_file.close()
print("📁 Повний лог польоту (включно з посадкою) збережено у файл: flight_log.csv")