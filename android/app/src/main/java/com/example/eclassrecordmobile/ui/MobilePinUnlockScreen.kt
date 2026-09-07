package com.example.eclassrecordmobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.ui.design.BrandDepthGradient
import com.example.eclassrecordmobile.ui.design.BrandMark
import com.example.eclassrecordmobile.ui.design.DepthIcon
import com.example.eclassrecordmobile.ui.design.NeonCard
import com.example.eclassrecordmobile.data.MobilePinLock
import com.example.eclassrecordmobile.theme.NeonPurple

@Composable
fun MobilePinUnlockScreen(profileName: String, onVerify: (String) -> Boolean) {
    var pin by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf(false) }
    var submitting by rememberSaveable { mutableStateOf(false) }
    val depth by animateFloatAsState(if (error) 0.97f else 1f, label = "pin-card-depth")
    fun tryUnlock(candidate: String) {
        if (candidate.length != 6 || submitting) return
        submitting = true
        if (!onVerify(candidate)) {
            error = true
            submitting = false
        }
    }
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.fillMaxSize().background(BrandDepthGradient).alpha(0.22f))
        NeonCard(
            modifier = Modifier
                .padding(24.dp)
                .fillMaxWidth()
                .graphicsLayer {
                    scaleX = depth
                    scaleY = depth
                    rotationX = if (error) 1.5f else 0f
                    shadowElevation = 28f
                },
            accent = NeonPurple.copy(alpha = 0.45f),
            contentPadding = PaddingValues(26.dp),
        ) {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                BrandMark(size = 72.dp)
                DepthIcon(Icons.Default.Lock, "Profile locked", selected = true, size = 54.dp)
                Text("Welcome back", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Unlock ${profileName.ifBlank { "your desktop profile" }} with the same six-digit PIN used on the desktop.",
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(2.dp))
                OutlinedTextField(
                    value = pin,
                    onValueChange = {
                        val next = it.filter(Char::isDigit).take(6)
                        pin = next
                        error = false
                        if (next.length < 6) submitting = false
                        tryUnlock(next)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Profile PIN") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    isError = error,
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = NeonPurple,
                        cursorColor = NeonPurple,
                    ),
                )
                AnimatedVisibility(visible = error, enter = fadeIn() + slideInVertically { -it / 2 }) {
                    Text(
                        MobilePinLock.lastError.ifBlank { "Incorrect PIN. Use the PIN for this desktop profile." },
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                    )
                }
                Button(
                    onClick = { tryUnlock(pin) },
                    enabled = pin.length == 6,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    shape = RoundedCornerShape(17.dp),
                ) { Text("Unlock", fontWeight = FontWeight.Bold) }
                Text("The PIN verifier is encrypted on this phone. Your actual PIN is never saved.", fontSize = 10.sp, textAlign = TextAlign.Center)
            }
        }
    }
}
