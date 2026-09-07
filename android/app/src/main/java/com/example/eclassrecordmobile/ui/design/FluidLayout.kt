package com.example.eclassrecordmobile.ui.design

import android.content.res.Configuration
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.min

/**
 * Fluid layout scale for phones and tablets in portrait and landscape.
 *
 * Token names match the requested design controls:
 * Fluid Type, Card Width, Corner Radius, Media Height, Fluid Gutter, Fluid Columns.
 */
data class FluidLayout(
    val typeScale: Float,
    val cardMaxWidth: Dp,
    val cornerRadius: Dp,
    val mediaHeight: Dp,
    val gutter: Dp,
    val columns: Int,
    val isLandscape: Boolean,
    val isTablet: Boolean,
    val useRailNavigation: Boolean,
) {
    fun type(baseSp: Int): TextUnit = (baseSp * typeScale).sp

    val itemGap: Dp get() = if (isTablet) 16.dp else 12.dp
    val metricColumns: Int get() = if (columns >= 3) 4 else 2

    companion object {
        fun phonePortrait() = FluidLayout(
            typeScale = 1.00f,
            cardMaxWidth = 560.dp,
            cornerRadius = 18.dp,
            mediaHeight = 152.dp,
            gutter = 16.dp,
            columns = 1,
            isLandscape = false,
            isTablet = false,
            useRailNavigation = false,
        )

        fun phoneLandscape() = FluidLayout(
            typeScale = 0.95f,
            cardMaxWidth = 720.dp,
            cornerRadius = 16.dp,
            mediaHeight = 108.dp,
            gutter = 20.dp,
            columns = 2,
            isLandscape = true,
            isTablet = false,
            useRailNavigation = true,
        )

        fun tabletPortrait() = FluidLayout(
            typeScale = 1.06f,
            cardMaxWidth = 720.dp,
            cornerRadius = 22.dp,
            mediaHeight = 196.dp,
            gutter = 24.dp,
            columns = 2,
            isLandscape = false,
            isTablet = true,
            useRailNavigation = true,
        )

        fun tabletLandscape() = FluidLayout(
            typeScale = 1.12f,
            cardMaxWidth = 1080.dp,
            cornerRadius = 24.dp,
            mediaHeight = 224.dp,
            gutter = 28.dp,
            columns = 3,
            isLandscape = true,
            isTablet = true,
            useRailNavigation = true,
        )

        fun fromWindow(widthDp: Int, heightDp: Int): FluidLayout {
            val landscape = widthDp > heightDp
            val shortest = min(widthDp, heightDp)
            val tablet = shortest >= 600
            val base = when {
                tablet && landscape -> tabletLandscape()
                tablet -> tabletPortrait()
                landscape -> phoneLandscape()
                else -> phonePortrait()
            }
            val usable = (widthDp - (base.gutter.value * 2)).coerceAtLeast(280f)
            return base.copy(cardMaxWidth = minOf(base.cardMaxWidth, usable.dp))
        }
    }
}

val LocalFluidLayout = staticCompositionLocalOf { FluidLayout.phonePortrait() }

@Composable
fun rememberFluidLayout(): FluidLayout {
    val configuration = LocalConfiguration.current
    return remember(configuration.screenWidthDp, configuration.screenHeightDp, configuration.orientation) {
        FluidLayout.fromWindow(configuration.screenWidthDp, configuration.screenHeightDp)
    }
}

@Composable
fun ProvideFluidLayout(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalFluidLayout provides rememberFluidLayout(), content = content)
}

@Composable
fun FluidContent(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val fluid = LocalFluidLayout.current
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = fluid.cardMaxWidth)
                .fillMaxWidth()
                .padding(horizontal = fluid.gutter),
            content = content,
        )
    }
}

fun Configuration.isLandscapeOrientation(): Boolean =
    orientation == Configuration.ORIENTATION_LANDSCAPE || screenWidthDp > screenHeightDp
