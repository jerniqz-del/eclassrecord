package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.eclassrecordmobile.data.PendingChangeReview
import com.example.eclassrecordmobile.data.PendingChangeReviewItem

@Composable
fun PushChangeReviewDialog(
    review: PendingChangeReview,
    selectedIds: Set<String>,
    onSelectedIdsChange: (Set<String>) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val selectedCount = selectedIds.size
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.96f)
                .fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Review mobile changes", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                Text(
                    "Safe additions fill empty desktop cells. Changes that may affect already written data stay off until you include them.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!review.hasAuthoritativeSnapshot) {
                    Text(
                        "This phone has not stored a clean desktop copy yet. Until the next desktop refresh, pending entries are listed as possibly changing existing records.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item(key = "safe-header") {
                        ReviewSectionHeader(
                            title = "Safe to add",
                            caption = "These write into empty scores, new attendance, new calendar events, or blank profile fields.",
                            items = review.safe,
                            selectedIds = selectedIds,
                            onSelectedIdsChange = onSelectedIdsChange,
                            affecting = false,
                        )
                    }
                    if (review.safe.isEmpty()) {
                        item(key = "safe-empty") {
                            Text("None in this push.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    } else {
                        items(review.safe, key = { "safe-${it.changeId}" }) { item ->
                            ReviewChangeRow(
                                item = item,
                                selected = item.changeId in selectedIds,
                                affecting = false,
                                onToggle = { checked ->
                                    onSelectedIdsChange(
                                        if (checked) selectedIds + item.changeId else selectedIds - item.changeId
                                    )
                                },
                            )
                        }
                    }
                    item(key = "affect-header") {
                        ReviewSectionHeader(
                            title = "May affect already written data",
                            caption = "These replace a score, attendance mark, calendar event, or school identity value already stored on the desktop.",
                            items = review.affecting,
                            selectedIds = selectedIds,
                            onSelectedIdsChange = onSelectedIdsChange,
                            affecting = true,
                        )
                    }
                    if (review.affecting.isEmpty()) {
                        item(key = "affect-empty") {
                            Text("None in this push.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    } else {
                        items(review.affecting, key = { "affect-${it.changeId}" }) { item ->
                            ReviewChangeRow(
                                item = item,
                                selected = item.changeId in selectedIds,
                                affecting = true,
                                onToggle = { checked ->
                                    onSelectedIdsChange(
                                        if (checked) selectedIds + item.changeId else selectedIds - item.changeId
                                    )
                                },
                            )
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(
                        onClick = onConfirm,
                        enabled = selectedCount > 0,
                    ) {
                        Text(
                            if (selectedCount == 1) "Continue with 1 change"
                            else "Continue with $selectedCount changes",
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewSectionHeader(
    title: String,
    caption: String,
    items: List<PendingChangeReviewItem>,
    selectedIds: Set<String>,
    onSelectedIdsChange: (Set<String>) -> Unit,
    affecting: Boolean,
) {
    val ids = items.map { it.changeId }.toSet()
    val allSelected = ids.isNotEmpty() && ids.all { it in selectedIds }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "$title (${items.size})",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = if (affecting) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
            if (items.isNotEmpty()) {
                TextButton(
                    onClick = {
                        onSelectedIdsChange(
                            if (allSelected) selectedIds - ids else selectedIds + ids
                        )
                    },
                ) {
                    Text(if (allSelected) "Clear" else "Select all")
                }
            }
        }
        Text(caption, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReviewChangeRow(
    item: PendingChangeReviewItem,
    selected: Boolean,
    affecting: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    val container = if (affecting) {
        MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f)
    } else {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(container, RoundedCornerShape(12.dp))
            .clickable { onToggle(!selected) }
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(checked = selected, onCheckedChange = onToggle)
        Column(modifier = Modifier.padding(top = 10.dp, end = 8.dp)) {
            Text(item.kindLabel.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(item.title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            if (item.detail.isNotBlank()) {
                Text(item.detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                "${item.previousValue} → ${item.newValue}",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
