package com.example.eclassrecordmobile.ui.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.R
import com.example.eclassrecordmobile.theme.LocalDarkTheme
import com.example.eclassrecordmobile.theme.LocalThemeController
import com.example.eclassrecordmobile.theme.NeonBlue
import com.example.eclassrecordmobile.theme.NeonGreen
import com.example.eclassrecordmobile.theme.NeonPanel
import com.example.eclassrecordmobile.theme.NeonPanelRaised
import com.example.eclassrecordmobile.theme.NeonPurple
import com.example.eclassrecordmobile.theme.Slate100

val BrandDepthGradient = Brush.linearGradient(
    listOf(NeonPurple, NeonBlue, NeonGreen),
)

val ActionHeight = 52.dp

@Composable
fun themePanel(raised: Boolean = false): Color {
    return if (LocalDarkTheme.current) {
        if (raised) NeonPanelRaised else NeonPanel
    } else {
        if (raised) Slate100 else Color.White
    }
}

@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
) {
    Image(
        painter = painterResource(R.drawable.eclass_3d_mark),
        contentDescription = "E-Class Record",
        modifier = modifier.size(size),
    )
}

@Composable
fun DepthIcon(
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    size: Dp = 42.dp,
    accent: Color = MaterialTheme.colorScheme.primary,
) {
    val shape = RoundedCornerShape(size * 0.32f)
    val lift by animateFloatAsState(if (selected) -3f else 0f, label = "depth-icon-lift")
    val tilt by animateFloatAsState(if (selected) 7f else 0f, label = "depth-icon-tilt")
    val colors = if (selected) {
        listOf(NeonBlue, accent, NeonPurple)
    } else {
        listOf(NeonPanelRaised, NeonPanel)
    }
    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                translationY = lift
                rotationX = tilt
                cameraDistance = 14f * density
            }
            .shadow(if (selected) 10.dp else 5.dp, shape)
            .clip(shape)
            .background(Brush.verticalGradient(colors))
            .border(1.dp, Color.White.copy(alpha = if (selected) 0.55f else 0.3f), shape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.Black.copy(alpha = 0.2f),
            modifier = Modifier.size(size * 0.52f).offset(y = 1.5.dp),
        )
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (selected) Color.White else accent,
            modifier = Modifier.size(size * 0.52f).offset(y = (-1).dp),
        )
    }
}

@Composable
fun DepthCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(LocalFluidLayout.current.cornerRadius)
    Surface(
        modifier = modifier.shadow(10.dp, shape, ambientColor = Color(0x220F172A), spotColor = Color(0x330F172A)),
        shape = shape,
        color = themePanel(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        content = content,
    )
}

@Composable
fun NeonCard(
    modifier: Modifier = Modifier,
    accent: Color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f),
    raised: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(18.dp),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(LocalFluidLayout.current.cornerRadius)
    Surface(
        modifier = modifier
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .shadow(10.dp, shape, ambientColor = Color(0x220F172A), spotColor = Color(0x330F172A)),
        shape = shape,
        color = themePanel(raised),
        border = BorderStroke(1.dp, accent),
    ) {
        Column(Modifier.padding(contentPadding), content = content)
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String = "",
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        if (subtitle.isNotBlank()) {
            Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun EmptyStateCard(
    title: String,
    detail: String = "",
    icon: ImageVector? = null,
) {
    NeonCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(28.dp), raised = true) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (icon != null) DepthIcon(icon, title, size = 54.dp)
            Text(title, fontWeight = FontWeight.ExtraBold)
            if (detail.isNotBlank()) {
                Text(detail, fontSize = 12.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        label = { Text(label) },
        singleLine = true,
        shape = RoundedCornerShape(18.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NeonPurple,
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            cursorColor = NeonBlue,
            focusedLabelColor = NeonPurple,
        ),
    )
}

@Composable
fun PrimaryActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(ActionHeight),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.4f),
        ),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null)
            Spacer(Modifier.width(8.dp))
        }
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun RemoteToolChip(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, if (enabled) NeonBlue.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
        contentPadding = PaddingValues(horizontal = 10.dp),
    ) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun WarningBadge(
    message: String,
    warning: Boolean,
) {
    val dark = LocalDarkTheme.current
    val background = when {
        warning && dark -> Color(0xFF3A2710)
        warning -> Color(0xFFFEF3C7)
        dark -> Color(0xFF3B1518)
        else -> Color(0xFFFEE2E2)
    }
    val foreground = when {
        warning && dark -> Color(0xFFFBBF24)
        warning -> Color(0xFFB45309)
        dark -> Color(0xFFFCA5A5)
        else -> Color(0xFFB91C1C)
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(background)
            .border(1.dp, foreground.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(message, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = foreground)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EClassTopBar(
    title: String,
    subtitle: String = "",
    onBack: (() -> Unit)? = null,
    actionIcon: ImageVector? = null,
    actionDescription: String = "Action",
    onAction: (() -> Unit)? = null,
    showThemeToggle: Boolean = true,
) {
    val fluid = LocalFluidLayout.current
    val dark = LocalDarkTheme.current
    val themeController = LocalThemeController.current
    TopAppBar(
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    DepthIcon(Icons.AutoMirrored.Filled.ArrowBack, "Back", size = 38.dp)
                }
            } else {
                BrandMark(modifier = Modifier.padding(start = 12.dp), size = 46.dp)
            }
        },
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onBack == null) Spacer(Modifier.width(5.dp))
                Column {
                    Text(
                        title,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = fluid.type(20),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (subtitle.isNotBlank()) {
                        Text(
                            subtitle,
                            fontSize = fluid.type(11),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        },
        actions = {
            if (showThemeToggle) {
                IconButton(onClick = { themeController.toggle() }) {
                    DepthIcon(
                        if (dark) Icons.Default.LightMode else Icons.Default.DarkMode,
                        if (dark) "Switch to light mode" else "Switch to dark mode",
                        size = 38.dp,
                        selected = dark,
                    )
                }
            }
            if (actionIcon != null && onAction != null) {
                IconButton(onClick = onAction) {
                    DepthIcon(actionIcon, actionDescription, size = 40.dp, selected = true)
                }
                Spacer(Modifier.width(10.dp))
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = themePanel().copy(alpha = 0.98f),
        ),
    )
}

@Composable
fun GradientSection(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(BrandDepthGradient)
            .padding(22.dp),
    ) {
        content()
    }
}
