from django.contrib.postgres.indexes import GistIndex
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("carbon_tracker", "0002_remove_oco2data_carbon_trac_acquisi_1b6529_idx_and_more"),
    ]

    operations = [
        AddIndexConcurrently(
            model_name="oco2data",
            index=models.Index(fields=["acquisition_time"], name="carbon_oco2_acq_idx"),
        ),
        AddIndexConcurrently(
            model_name="oco2data",
            index=GistIndex(fields=["location"], name="carbon_oco2_loc_gix"),
        ),
        migrations.AlterModelOptions(
            name="oco2data",
            options={
                "indexes": [
                    models.Index(fields=["acquisition_time"], name="carbon_oco2_acq_idx"),
                    GistIndex(fields=["location"], name="carbon_oco2_loc_gix"),
                ],
                "ordering": ("-acquisition_time", "-sounding_id"),
            },
        ),
    ]
