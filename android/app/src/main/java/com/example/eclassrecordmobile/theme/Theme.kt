package com.example.eclassrecordmobile.theme

import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.eclassrecordmobile.ui.design.LocalFluidLayout
import com.example.eclassrecordmobile.ui.design.rememberFluidLayout

private val DarkColorScheme =
  darkColorScheme(
    primary = NeonPurple,
    onPrimary = Color.White,
    primaryContainer = NeonPurpleDark,
    onPrimaryContainer = Color.White,
    secondary = NeonBlue,
    onSecondary = Color.White,
    secondaryContainer = NeonBlueDark,
    onSecondaryContainer = Color.White,
    tertiary = NeonGreen,
    onTertiary = Color(0xFF03140A),
    tertiaryContainer = NeonGreenDark,
    onTertiaryContainer = Color.White,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = NeonPanel,
    onSurface = DarkOnSurface,
    surfaceVariant = NeonPanelRaised,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    outlineVariant = Color(0xFF30363D),
    error = ErrorDark,
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Error100,
  )

private val LightColorScheme =
  lightColorScheme(
    primary = Brand700,
    onPrimary = Color.White,
    primaryContainer = Brand100,
    onPrimaryContainer = Brand900,
    secondary = Indigo700,
    onSecondary = Color.White,
    secondaryContainer = Indigo100,
    onSecondaryContainer = Indigo950,
    tertiary = Amber700,
    onTertiary = Color.White,
    tertiaryContainer = Amber100,
    onTertiaryContainer = Color(0xFF451A03),
    background = Slate50,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate600,
    outline = Slate400,
    outlineVariant = Slate200,
    error = Error700,
    onError = Color.White,
    errorContainer = Error100,
    onErrorContainer = Color(0xFF7F1D1D),
  )

private val AppShapes =
  Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
  )

data class ThemeController(
  val darkTheme: Boolean,
  val setDarkTheme: (Boolean) -> Unit,
) {
  fun toggle() = setDarkTheme(!darkTheme)
}

val LocalDarkTheme = staticCompositionLocalOf { false }
val LocalThemeController = staticCompositionLocalOf {
  ThemeController(darkTheme = false, setDarkTheme = {})
}

@Composable
fun EClassRecordMobileTheme(
  darkTheme: Boolean = false,
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme =
    when {
      dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = LocalContext.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
      }
      darkTheme -> DarkColorScheme
      else -> LightColorScheme
    }
  val fluid = rememberFluidLayout()

  CompositionLocalProvider(
    LocalDarkTheme provides darkTheme,
    LocalFluidLayout provides fluid,
  ) {
    MaterialTheme(
      colorScheme = colorScheme,
      typography = Typography,
      shapes = AppShapes,
      content = content,
    )
  }
}
