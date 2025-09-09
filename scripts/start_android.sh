# Wait for the device connection command to finish
adb -s emulator-5554 wait-for-device && \
npm run android
