package com.example.eclassrecordmobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BluetoothPairingQrParserTest {
    private val validPayload = listOf(
        "ECLASS-COMPANION",
        "1",
        "bluetooth",
        "bluetooth",
        "0",
        "7b9efcf8-50b1-4ced-9d20-377d97f97423",
        "abcdefghijklmnopqrstuvwxyzABCDEFG123456",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "039494",
    ).joinToString("|")

    @Test
    fun parsesCurrentBluetoothQr() {
        val result = BluetoothPairingQrParser.parse(validPayload)
        assertEquals("039494", result.pin)
        assertEquals("7b9efcf8-50b1-4ced-9d20-377d97f97423", result.sessionId)
    }

    @Test
    fun rejectsWifiAndMissingPinPayloads() {
        assertThrows(IllegalArgumentException::class.java) {
            BluetoothPairingQrParser.parse(validPayload.replace("|bluetooth|bluetooth|", "|wlan|192.168.1.2|"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            BluetoothPairingQrParser.parse(validPayload.substringBeforeLast('|'))
        }
    }
}

