import { BoardName, LedPlacements } from '@/app/lib/types';
import { HOLD_STATE_MAP } from '../board-renderer/types';

// Bluetooth constants
const MAX_BLUETOOTH_MESSAGE_SIZE = 20;
const MESSAGE_BODY_MAX_LENGTH = 255;
const PACKET_MIDDLE = 81;
const PACKET_FIRST = 82;
const PACKET_LAST = 83;
const PACKET_ONLY = 84;
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// Helper functions (same as before)
const checksum = (data: number[]) => data.reduce((acc, value) => (acc + value) & 255, 0) ^ 255;

const wrapBytes = (data: number[]) =>
  data.length > MESSAGE_BODY_MAX_LENGTH ? [] : [1, data.length, checksum(data), 2, ...data, 3];

const encodePosition = (position: number) => [position & 255, (position >> 8) & 255];

const encodeColor = (color: string) => {
  const parsedColor = [
    Math.floor(parseInt(color.substring(0, 2), 16) / 32) << 5,
    Math.floor(parseInt(color.substring(2, 4), 16) / 32) << 2,
    Math.floor(parseInt(color.substring(4, 6), 16) / 64),
  ].reduce((acc, val) => acc | val);
  return parsedColor;
};

const encodePositionAndColor = (position: number, ledColor: string) => [
  ...encodePosition(position),
  encodeColor(ledColor),
];

export const getBluetoothPacket = (frames: string, placementPositions: LedPlacements, board_name: BoardName) => {
  const resultArray: number[][] = [];
  let tempArray = [PACKET_MIDDLE];

  frames.split('p').forEach((frame) => {
    if (!frame) return;

    const [placement, role] = frame.split('r');
    const encodedFrame = encodePositionAndColor(
      Number(placementPositions[Number(placement)]),
      HOLD_STATE_MAP[board_name][Number(role)].color.replace('#', ''),
    );

    if (tempArray.length + encodedFrame.length > MESSAGE_BODY_MAX_LENGTH) {
      resultArray.push(tempArray);
      tempArray = [PACKET_MIDDLE];
    }
    tempArray.push(...encodedFrame);
  });

  resultArray.push(tempArray);
  if (resultArray.length === 1) resultArray[0][0] = PACKET_ONLY;
  else {
    resultArray[0][0] = PACKET_FIRST;
    resultArray[resultArray.length - 1][0] = PACKET_LAST;
  }

  return Uint8Array.from(resultArray.flatMap(wrapBytes));
};

export const splitMessages = (buffer: Uint8Array) =>
  Array.from({ length: Math.ceil(buffer.length / MAX_BLUETOOTH_MESSAGE_SIZE) }, (_, i) =>
    buffer.slice(i * MAX_BLUETOOTH_MESSAGE_SIZE, (i + 1) * MAX_BLUETOOTH_MESSAGE_SIZE),
  );

export const writeCharacteristicSeries = async (
  characteristic: BluetoothRemoteGATTCharacteristic,
  messages: Uint8Array[],
) => {
  for (const message of messages) {
    await characteristic.writeValue(message);
  }
};

export const requestDevice = async (namePrefix: string) =>
  navigator.bluetooth.requestDevice({
    filters: [{ namePrefix }],
    optionalServices: [SERVICE_UUID],
  });

export const getCharacteristic = async (device: BluetoothDevice) => {
  const server = await device.gatt?.connect();
  const service = await server?.getPrimaryService(SERVICE_UUID);
  return await service?.getCharacteristic(CHARACTERISTIC_UUID);
};
